/**
 * The import-protection facade a Start host owns for one session (a dev
 * server or a build): the resolved config, the `import-edges` planner, one
 * `ImportProtectionEnv` per Start environment (edge modules, dev reports,
 * build verdicts, traces), and the edge modules' code. Host-agnostic: the
 * Vite and Rspack hosts call it from their hooks (integration contract:
 * impl-notes-import-protection.md).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import picomatch from 'picomatch'
import { importEdgesPlanner } from '../planners/edges'
import { resolveImportProtectionConfig } from './config'
import {
  allowedModuleCode,
  mockModuleCode,
  mockRuntimeCode,
  viteEdgeModuleIds,
} from './edge-modules'
import { EdgeIndex, buildTrace } from './graph-trace'
import { DevReporter, devViolationError } from './report'
import { importerInScope } from './rules'
import { BuildVerdicts, RSPACK_BUILD_INFO_KEY } from './verdict'
import { dedupeKey, violationInfo, violationsOf } from './violations'
import { witnessLookup } from './witness'
import { formatViolation } from './trace'
import type { Planner } from '@tanstack/router-utils/compiler'
import type {
  ImportProtectionConfig,
  ImportProtectionMode,
  MarkerKind,
} from './config'
import type {
  EdgeModuleContent,
  EdgeModuleIds,
  EdgeModuleRef,
} from './edge-modules'
import type { ImportGraphView } from './graph-trace'
import type { DevReporterOptions, ReportSink } from './report'
import type { EnvType } from './rules'
import type { DecideResult, RspackImportProtectionBuildInfo } from './verdict'
import type { EdgeViolation } from './violations'
import type { WitnessLookup } from './witness'
import type { TraceStep, ViolationInfo } from './trace'
import type { ImportProtectionOptions } from '../schema'

export interface CreateImportProtectionOptions {
  /** The user's `importProtection` option. */
  options: ImportProtectionOptions | undefined
  root: string
  srcDirectory: string
  /** From the bundler's command/mode (never `process.env.NODE_ENV`). */
  mode: ImportProtectionMode
  /** How the host names edge modules (default: Vite ids). */
  ids?: EdgeModuleIds
  /** tsconfig `verbatimModuleSyntax` (TypeScript keeps unused imports). */
  verbatimModuleSyntax?: boolean
  /** Reads a file (a package's `package.json` for `sideEffects`); default `node:fs`. */
  readFile?: (file: string) => Promise<string | null>
  /**
   * Whether a path is an entry of the app (router, start, client and server
   * entries): a marked entry compiled in the env its marker denies is its
   * own violation (nothing else explains its presence). Default: none.
   */
  isEntry?: (path: string) => boolean
}

/** The code of one of our modules, for a host's `load` (or virtual file). */
export interface EdgeModuleLoad {
  code: string
  /** Vite `moduleSideEffects`: false for the runtime only; edge modules are analysed (null). */
  moduleSideEffects: false | null
}

export type EdgeModuleListener = (
  specifier: string,
  load: EdgeModuleLoad,
  ref: EdgeModuleRef,
) => void

/** Creates the session's import protection; null when `enabled: false` (register nothing). */
export function createImportProtection(
  opts: CreateImportProtectionOptions,
): ImportProtection | null {
  const config = resolveImportProtectionConfig(opts.options, {
    root: opts.root,
    srcDirectory: opts.srcDirectory,
    mode: opts.mode,
    verbatimModuleSyntax: opts.verbatimModuleSyntax,
  })
  return config
    ? new ImportProtection(
        config,
        opts.ids ?? viteEdgeModuleIds,
        opts.readFile ?? readFileOrNull,
        opts.isEntry ?? (() => false),
      )
    : null
}

async function readFileOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

export class ImportProtection {
  readonly planner: Planner
  private readonly envs = new Map<string, ImportProtectionEnv>()
  private readonly listeners = new Set<EdgeModuleListener>()
  private readonly scopeCache = new Map<string, boolean>()
  private readonly packageDirs = new Map<string, Promise<string | null>>()
  private readonly packageSideEffects = new Map<
    string,
    Promise<boolean | Array<string>>
  >()

  constructor(
    readonly config: ImportProtectionConfig,
    readonly ids: EdgeModuleIds,
    private readonly readFile: (file: string) => Promise<string | null>,
    /** Whether a path is an app entry (`CreateImportProtectionOptions.isEntry`). */
    readonly isEntry: (path: string) => boolean,
  ) {
    this.planner = importEdgesPlanner(this)
  }

  /** The marker specifiers to give the session's `RawFactsCache` (every analysis must agree on markers). */
  get markerSpecifiers(): Record<string, MarkerKind> {
    return this.config.markerSpecifiers
  }

  /** The environment's state; `type` is required the first time (the planner passes `EnvInfo.type`). */
  env(name: string, type?: EnvType): ImportProtectionEnv {
    let env = this.envs.get(name)
    if (!env) {
      if (!type) {
        throw new Error(
          `[import-protection] unknown environment "${name}" (create it with its type first)`,
        )
      }
      env = new ImportProtectionEnv(this, name, type)
      this.envs.set(name, env)
    }
    return env
  }

  environments(): Iterable<ImportProtectionEnv> {
    return this.envs.values()
  }

  /** Whether an importer path is checked (cached per path). */
  inScope(importerPath: string): boolean {
    return importerInScope(this.config, importerPath, this.scopeCache)
  }

  /** Called with the code of every edge module (and runtime) when it is defined or changes state (Rspack: write the virtual file). */
  onEdgeModule(listener: EdgeModuleListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The code of one of our modules by any id form; null when it is not ours. */
  load(id: string): EdgeModuleLoad | null {
    const ref = this.ids.parse(id)
    if (!ref) {
      return null
    }
    if (ref.kind === 'runtime') {
      return this.runtimeLoad()
    }
    const env = this.envs.get(ref.env)
    return env
      ? env.edgeLoad(ref.key)
      : unknownEdgeLoad(ref.env, ref.key, this.ids)
  }

  /** @internal */
  runtimeLoad(): EdgeModuleLoad {
    return {
      code: mockRuntimeCode(this.config.mockAccess),
      moduleSideEffects: false,
    }
  }

  /** @internal */
  emit(ref: EdgeModuleRef, load: EdgeModuleLoad): void {
    if (this.listeners.size === 0) {
      return
    }
    const specifier = this.ids.specifier(ref)
    for (const l of this.listeners) {
      l(specifier, load, ref)
    }
  }

  /**
   * Whether the package containing `file` declares it free of side effects
   * (`package.json` `sideEffects`: `false`, or an array not matching it).
   * No `package.json` or no field: it has effects. Cached per package for
   * the session.
   */
  async packageSideEffectFree(file: string): Promise<boolean> {
    const dir = await this.packageDirOf(path.dirname(file))
    if (dir === null) {
      return false
    }
    let decl = this.packageSideEffects.get(dir)
    if (!decl) {
      decl = this.readFile(path.join(dir, 'package.json')).then((text) => {
        try {
          const value = (JSON.parse(text ?? '{}') as { sideEffects?: unknown })
            .sideEffects
          return value === false
            ? false
            : Array.isArray(value)
              ? value.filter((p): p is string => typeof p === 'string')
              : true
        } catch {
          return true
        }
      })
      this.packageSideEffects.set(dir, decl)
    }
    const value = await decl
    if (value === false) {
      return true
    }
    if (value === true) {
      return false
    }
    const rel = path.relative(dir, file).replace(/\\/g, '/')
    return !value.some((pattern) => {
      const p = pattern.replace(/^\.\//, '')
      return p.includes('/')
        ? picomatch.isMatch(rel, p, { dot: true })
        : picomatch.isMatch(path.posix.basename(rel), p, { dot: true })
    })
  }

  private packageDirOf(dir: string): Promise<string | null> {
    let found = this.packageDirs.get(dir)
    if (!found) {
      found = this.readFile(path.join(dir, 'package.json')).then((text) => {
        if (text !== null) {
          return dir
        }
        const parent = path.dirname(dir)
        return parent === dir || path.basename(dir) === 'node_modules'
          ? null
          : this.packageDirOf(parent)
      })
      this.packageDirs.set(dir, found)
    }
    return found
  }
}

/** An edge module nothing registered (a stale importer after a restart): a mock with a default export only. */
function unknownEdgeLoad(
  env: string,
  key: string,
  ids: EdgeModuleIds,
): EdgeModuleLoad {
  const edgeKey = key.split('.')[0] ?? key
  return {
    code: mockModuleCode(
      {
        env,
        edgeKey,
        specifier: edgeKey,
        importer: '',
        file: null,
        names: [],
        effectful: false,
        resolved: null,
        hasDefault: true,
        bare: false,
      },
      ids.specifier({ env, kind: 'runtime' }),
    ),
    moduleSideEffects: null,
  }
}

interface RegisteredModule {
  content: EdgeModuleContent
  /** Violations importing it, by `${importerId}\0${edgeKey}`. */
  violations: Map<string, EdgeViolation>
}

/** A compile output, as `compileModule` returns it (structural). */
export interface CompiledOutputLike {
  output: string
  facts: { planners: Record<string, unknown> }
}

/** The outcome of a dev compile for its host: an error fails the transform (`behavior: 'error'`). */
export interface DevCompileOutcome {
  error: Error | null
}

/** One Start environment's import protection. */
export class ImportProtectionEnv {
  /** Resolved edges of every judged importer (trace steps). */
  readonly edges = new EdgeIndex()
  /** Build verdicts of the current logical build. */
  readonly build = new BuildVerdicts()
  /** The bundler's graph (dev: the dev server's module graph; build: set per pass by the witness reader). */
  graph: ImportGraphView | null = null
  /** Dev report queue (`useDevReporter`). */
  reporter: DevReporter | null = null
  private readonly modules = new Map<string, RegisteredModule>()
  private readonly byImporter = new Map<string, Set<string>>()
  private readonly onceVerdicts = new Map<string, Promise<boolean | void>>()
  private buildInfos = new Map<string, ViolationInfo>()
  private runtimeEmitted = false
  private selfReported = new Set<string>()

  constructor(
    private readonly ip: ImportProtection,
    readonly name: string,
    readonly type: EnvType,
  ) {
    this.build.onStateChange = (edgeKey) => {
      for (const [key, m] of this.modules) {
        if (m.content.edgeKey === edgeKey) {
          this.ip.emit(
            { env: this.name, kind: 'edge', key },
            this.edgeLoad(key)!,
          )
        }
      }
    }
  }

  /** Dev: print reports through `sink` once the graph knows the importer (`reachable`). */
  useDevReporter(
    sink: ReportSink,
    reachable?: (importerId: string) => boolean,
    options?: Pick<DevReporterOptions, 'setTimer' | 'clearTimer' | 'maxWait'>,
  ): DevReporter {
    this.reporter?.close()
    this.reporter = new DevReporter({
      config: this.ip.config,
      sink,
      reachable: reachable ?? ((id) => this.reachable(id)),
      ...options,
    })
    return this.reporter
  }

  /**
   * Dev `log: 'always'` on a host whose compilation keeps modules it did not
   * compile again (Rspack): the violations of such an importer's record are
   * reported again (`onViolation` asked again, the report printed again),
   * as every compilation bundling them reports them.
   */
  async reportAgain(importerId: string, info: unknown): Promise<void> {
    const record = info as RspackImportProtectionBuildInfo | undefined
    if (
      record?.version !== 1 ||
      record.env !== this.name ||
      this.ip.config.mode !== 'dev' ||
      this.ip.config.log !== 'always'
    ) {
      return
    }
    for (const v of record.violations) {
      if (v.env !== this.name || v.behavior !== 'mock') {
        continue
      }
      const vi = violationInfo(v, this.ip.config, () => this.trace(importerId))
      const verdict = await this.ip.config.onViolation?.(vi)
      if (verdict !== false) {
        this.reporter?.enqueue({ violation: v, info: vi })
      }
    }
  }

  /**
   * A module of this environment that imports the marker of the opposite
   * environment and that nothing imports (an entry): it reports itself
   * (J6.6; its importers would otherwise). `onViolation` is asked once per
   * logical build / dev session per module; returns the report to publish
   * (null: vetoed or already reported).
   */
  async selfMarkedReport(
    file: string,
    marker: { specifier: string; line: number },
  ): Promise<{ severity: 'error' | 'warning'; message: string } | null> {
    const key = `self\u0000${file}`
    if (this.selfReported.has(key)) {
      return null
    }
    this.selfReported.add(key)
    const info: ViolationInfo = {
      env: this.name,
      envType: this.type,
      type: 'marker',
      behavior: this.ip.config.behavior,
      specifier: marker.specifier,
      importer: file,
      importerLoc: { file, line: marker.line, column: 1 },
      resolved: file,
      trace: [
        { file, line: marker.line, column: 1, specifier: marker.specifier },
      ],
    }
    const verdict = await this.ip.config.onViolation?.(info)
    if (verdict === false) {
      return null
    }
    return {
      severity: this.ip.config.behavior === 'error' ? 'error' : 'warning',
      message: formatViolation(info, this.ip.config.root),
    }
  }

  /** Whether the graph knows how `importerId` is reached. */
  reachable(importerId: string): boolean {
    const g = this.graph
    if (!g) {
      return false
    }
    if (g.isEntry(importerId)) {
      return true
    }
    for (const _ of g.importers(importerId)) {
      return true
    }
    for (const _ of this.edges.importers(importerId)) {
      return true
    }
    return false
  }

  /** The trace of an importer from the graph as it is now. */
  trace(importerId: string, graph = this.graph): Array<TraceStep> {
    return buildTrace(
      importerId,
      graph,
      this.edges,
      this.ip.config.maxTraceDepth,
    )
  }

  /**
   * Dev `log: 'once'`: `onViolation` decides a logical edge once per
   * session (its later compiles reuse the verdict).
   * @internal
   */
  onceVerdict(
    key: string,
    ask: () => Promise<boolean | void>,
  ): Promise<boolean | void> {
    let p = this.onceVerdicts.get(key)
    if (!p) {
      p = ask()
      this.onceVerdicts.set(key, p)
    }
    return p
  }

  /**
   * After EVERY compile of an id of this environment (fresh or cached):
   * registers the output's edge modules (Rspack: their virtual files are
   * written through `onEdgeModule` before the importer's dependencies
   * resolve) and, in dev, queues mock reports and returns the error of
   * `behavior: 'error'` violations (the module must not be served).
   */
  afterCompile(importerId: string, out: CompiledOutputLike): DevCompileOutcome {
    return this.register(importerId, violationsOf(out))
  }

  /** Replays an Rspack module's `buildInfo` record (a module restored from the persistent cache). */
  replay(importerId: string, info: unknown): void {
    const record = info as RspackImportProtectionBuildInfo | undefined
    if (record?.version === 1 && record.env === this.name) {
      this.register(importerId, record.violations, false)
    }
  }

  /** What the Rspack loader stores in `buildInfo[RSPACK_BUILD_INFO_KEY]` for a compiled output (null: nothing). */
  buildInfo(out: CompiledOutputLike): {
    key: string
    value: RspackImportProtectionBuildInfo
  } | null {
    const violations = violationsOf(out)
    return violations.length > 0
      ? {
          key: RSPACK_BUILD_INFO_KEY,
          value: { version: 1, env: this.name, violations },
        }
      : null
  }

  private register(
    importerId: string,
    violations: Array<EdgeViolation>,
    report = true,
  ): DevCompileOutcome {
    const keys = new Set<string>()
    for (const v of violations) {
      if (v.env !== this.name || !v.module) {
        continue
      }
      keys.add(v.module.key)
      let m = this.modules.get(v.module.key)
      if (!m) {
        m = { content: v.module.content, violations: new Map() }
        this.modules.set(v.module.key, m)
        if (!this.runtimeEmitted) {
          this.runtimeEmitted = true
          this.ip.emit(
            { env: this.name, kind: 'runtime' },
            this.ip.runtimeLoad(),
          )
        }
        this.ip.emit(
          { env: this.name, kind: 'edge', key: v.module.key },
          this.edgeLoad(v.module.key)!,
        )
      }
      m.violations.set(`${v.importerId}\u0000${v.edgeKey}`, v)
    }
    const previous = this.byImporter.get(importerId)
    this.byImporter.set(importerId, keys)
    if (previous && this.ip.config.mode === 'dev') {
      for (const key of previous) {
        if (!keys.has(key)) {
          this.release(importerId, key)
        }
      }
    }
    if (!report || this.ip.config.mode !== 'dev') {
      return { error: null }
    }
    const errors: Array<ViolationInfo> = []
    for (const v of violations) {
      if (v.env !== this.name) {
        continue
      }
      const info = violationInfo(v, this.ip.config, () =>
        this.trace(v.importerId),
      )
      if (v.behavior === 'error') {
        errors.push(info)
      } else {
        this.reporter?.enqueue({ violation: v, info })
      }
    }
    if (errors.length === 0) {
      return { error: null }
    }
    for (const info of errors) {
      ;(info as ViolationInfo & { freezeTrace: () => unknown }).freezeTrace()
    }
    const error = devViolationError(errors[0]!, this.ip.config)
    if (errors.length > 1) {
      error.message = errors
        .map((info) => formatViolation(info, this.ip.config.root))
        .join('\n')
    }
    return { error }
  }

  private release(importerId: string, key: string): void {
    const m = this.modules.get(key)
    if (!m) {
      return
    }
    for (const k of [...m.violations.keys()]) {
      if (k.startsWith(`${importerId}\u0000`)) {
        m.violations.delete(k)
      }
    }
    // dev keeps an unreferenced module servable for a stale importer until it is reloaded
    if (m.violations.size === 0 && this.modules.size > 2048) {
      this.modules.delete(key)
    }
  }

  /** The code of an edge module of this environment in its current state (mock unless a build vetoed its edge). */
  edgeLoad(key: string): EdgeModuleLoad | null {
    const m = this.modules.get(key)
    if (!m) {
      return unknownEdgeLoad(this.name, key, this.ip.ids)
    }
    const runtime = this.ip.ids.specifier({ env: this.name, kind: 'runtime' })
    const c = m.content
    if (
      this.ip.config.mode === 'build' &&
      this.build.stateOf(c.edgeKey) === 'allowed'
    ) {
      return {
        code: allowedModuleCode(c, c.resolved ?? c.specifier),
        moduleSideEffects: null,
      }
    }
    return { code: mockModuleCode(c, runtime), moduleSideEffects: null }
  }

  /** The witness readers' view of this environment's edge modules. */
  witness(): WitnessLookup {
    return witnessLookup(this.ip.ids, this.name, (key) => {
      const m = this.modules.get(key)
      return m ? m.content.effectful : null
    })
  }

  /** Every registered edge module (Rspack: write the virtual files of a fresh compiler). */
  *edgeModules(): Iterable<{ specifier: string; load: EdgeModuleLoad }> {
    for (const key of this.modules.keys()) {
      yield {
        specifier: this.ip.ids.specifier({
          env: this.name,
          kind: 'edge',
          key,
        }),
        load: this.edgeLoad(key)!,
      }
    }
  }

  /** A fresh logical build of this environment (Vite `buildApp`, Rspack `run`/`watchRun`). */
  beginLogicalBuild(): void {
    this.build.beginLogicalBuild()
    this.buildInfos = new Map()
    this.selfReported.clear()
  }

  /**
   * One build pass's verdict (R33): the surviving edge modules (`liveKeys`,
   * from `readRolldownWitness`/`readRspackWitness`) → `onViolation` once per
   * new logical edge (with its trace in `graph`) → veto → `needPass`.
   */
  async decide(
    liveKeys: ReadonlyArray<string>,
    graph: ImportGraphView | null,
  ): Promise<DecideResult> {
    this.graph = graph
    const live: Array<EdgeViolation> = []
    for (const key of liveKeys) {
      const m = this.modules.get(key)
      if (m) {
        live.push(...m.violations.values())
      }
    }
    return this.build.decide(live, async (v) => {
      const info = violationInfo(v, this.ip.config, () =>
        this.trace(v.importerId, graph),
      )
      info.freezeTrace()
      this.buildInfos.set(v.edgeKey, info)
      return this.ip.config.onViolation?.(info)
    })
  }

  /**
   * The settled build's reports, formatted (`error` behaviour: the build
   * fails with them; `mock`: warnings). Empty while a pass is pending.
   */
  buildReports(): Array<{
    severity: 'error' | 'warning'
    message: string
    info: ViolationInfo
  }> {
    if (this.build.needPass) {
      return []
    }
    const seen = new Set<string>()
    const out: Array<{
      severity: 'error' | 'warning'
      message: string
      info: ViolationInfo
    }> = []
    for (const v of this.build.reports) {
      const key = dedupeKey(v)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      const info =
        this.buildInfos.get(v.edgeKey) ??
        violationInfo(v, this.ip.config, () => this.trace(v.importerId))
      out.push({
        severity: v.behavior === 'error' ? 'error' : 'warning',
        message: formatViolation(info, this.ip.config.root),
        info,
      })
    }
    return out
  }
}
