/**
 * The import-protection facade a Start host owns for one session (a dev
 * server or a build): the resolved config, the `import-edges` planner, one
 * `ImportProtectionEnv` per Start environment (edge modules, the
 * `allowImport` decision, dev and build reports, traces), and the edge modules' code. Host-agnostic: the
 * Vite and Rspack hosts call it from their hooks.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import picomatch from 'picomatch'
import {
  deriveId,
  identify,
  invariantDiagnostic,
  invariantViolated,
  normalizePath,
} from '@tanstack/router-utils/compiler'
import { NODE_MODULES_RE } from '../compiler/scope'
import { importEdgesPlanner } from '../planners/edges'
import { resolveImportProtectionConfig } from './config'
import {
  allowedModuleCode,
  mockModuleCode,
  mockRuntimeCode,
  viteEdgeModuleIds,
} from './edge-modules'
import {
  EdgeIndex,
  IdsByFile,
  readSourceFile,
  traceFile,
  traceOf,
} from './graph-trace'
import { Locator } from './locate'
import { findPatternImport } from './pattern-imports'
import { matchesAny } from './matchers'
import { DevReporter, devViolationError } from './report'
import { fileOrMarkerRule, importerInScope } from './rules'
import { normalizeFilePath, relativizePath } from './utils'
import {
  IMPORT_EDGES_PLANNER,
  RSPACK_BUILD_INFO_KEY,
  allowImportInfo,
  dedupeKey,
  selfViolationOf,
  violationInfo,
  violationsOf,
} from './violations'
import { witnessLookup } from './witness'
import {
  formatServedConflict,
  formatServedMismatch,
  formatUncheckedImporters,
  formatViolation,
} from './trace'
import type { Planner, StaleSets } from '@tanstack/router-utils/compiler'
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
import type { ImportGraphView, SourceReader, Trace } from './graph-trace'
import type { DevReport, DevReporterOptions, ReportSink } from './report'
import type { EnvType } from './rules'
import type {
  EdgeViolation,
  RspackImportProtectionBuildInfo,
} from './violations'
import type { WitnessLookup } from './witness'
import type { ReportContext, ViolationInfo } from './trace'
import type { ImportProtectionOptions } from '../schema'
import type { CompileStartFrameworkOptions } from '../types'

export interface CreateImportProtectionOptions {
  /** The user's `importProtection` option. */
  options: ImportProtectionOptions | undefined
  root: string
  srcDirectory: string
  /** From the bundler's command/mode (never `process.env.NODE_ENV`). */
  mode: ImportProtectionMode
  /** How the host names edge modules (default: Vite ids). */
  ids?: EdgeModuleIds
  /** Reads a file (a package's `package.json` for `sideEffects`); default `node:fs`. */
  readFile?: (file: string) => Promise<string | null>
  /** Reads a source file's raw text, synchronously (trace positions, `EdgeIndex`); default `node:fs`. */
  readSource?: SourceReader
  /**
   * Whether a path is an entry of the app (router, start, client and server
   * entries): a marked entry compiled in the env its marker denies is its
   * own violation (nothing else explains its presence). Default: none.
   */
  isEntry?: (path: string) => boolean
  /** The app's framework: the package reports name for `<ClientOnly>` (default `react`). */
  framework?: CompileStartFrameworkOptions
}

/** The code of one of our modules, for a host's `load` (or virtual file). */
interface EdgeModuleLoad {
  code: string
  /** Vite `moduleSideEffects`: false for the runtime only; edge modules are analysed (null). */
  moduleSideEffects: false | null
}

type EdgeModuleListener = (
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
  })
  return config
    ? new ImportProtection(
        config,
        opts.ids ?? viteEdgeModuleIds,
        opts.readFile ?? readFileOrNull,
        opts.isEntry ?? (() => false),
        opts.readSource,
        opts.framework,
      )
    : null
}

/**
 * Whether a module id is one of `ids` (a compilation's modules): as given
 * (the hosts record the ids they compile), else compared as the compiler
 * keys an output, its canonical id with its owned query for a derived one
 * (`ImportProtectionEnv.hold`). The second form is built on the first miss
 * only: an id that left the compilation is rare.
 */
export function heldIn(ids: Iterable<string>): (id: string) => boolean {
  const held = new Set(ids)
  let keys: Set<string> | null = null
  return (id) => {
    if (held.has(id)) {
      return true
    }
    keys ??= new Set([...held].map(outputKey))
    return keys.has(outputKey(id))
  }
}

function outputKey(id: string): string {
  const identity = identify(normalizePath(id))
  return identity.derived
    ? deriveId(identity.canonicalId, identity.derived)
    : identity.canonicalId
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
  /**
   * Per environment type, the modules the allowed imports of a released
   * environment brought into it. A live environment's are read from its
   * ledger (`ImportProtectionEnv.allowedImporters`: they live as long as an
   * import allowed for them); a released one's stay for the session: the
   * module also comes to environments of that type where nothing checked
   * imports it (RSC: the `ssr` environment loads the `'use client'` module
   * the `rsc` environment allowed, from plugin code), and a build releases
   * the first environment before the next one builds.
   */
  private readonly releasedTargets: Record<EnvType, Set<string>> = {
    client: new Set(),
    server: new Set(),
  }
  private warnedOnViolationFalse = false
  /** How reports are formatted. */
  readonly report: ReportContext

  constructor(
    readonly config: ImportProtectionConfig,
    readonly ids: EdgeModuleIds,
    private readonly readFile: (file: string) => Promise<string | null>,
    /** Whether a path is an app entry (`CreateImportProtectionOptions.isEntry`). */
    readonly isEntry: (path: string) => boolean,
    /** Raw source text for trace positions (`CreateImportProtectionOptions.readSource`). */
    readonly readSource: SourceReader = readSourceFile,
    readonly framework: CompileStartFrameworkOptions = 'react',
  ) {
    this.planner = importEdgesPlanner(this)
    this.report = { config, readSource, framework }
  }

  /**
   * The compiler's stale sets, from a host whose compilations build their
   * stale paths again before they end (Rsbuild's `finishMake` drain): there
   * an importer whose plan is stale in an environment explains the presence
   * of what it imports (a module edited to be marked is built before its
   * unchanged importer). Vite's hooks take their sets before any module is
   * compiled again: an importer is compiled again first, and the module is
   * reported once, at the import; a path stale there after the take waits
   * for the next file event, so it explains nothing.
   */
  stale: Pick<StaleSets, 'holds' | 'add'> | null = null

  /** Reads `stale` (Rsbuild). */
  useStaleImporters(stale: Pick<StaleSets, 'holds' | 'add'>): void {
    this.stale = stale
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

  /**
   * Releases an environment's state once its build is finished (edges,
   * edge modules, verdicts): nothing later reads it, and a later compile in
   * the environment starts over (`env(name, type)`).
   */
  release(name: string): void {
    const env = this.envs.get(name)
    if (env) {
      for (const target of env.allowedTargets()) {
        this.releasedTargets[env.type].add(target)
      }
    }
    this.envs.delete(name)
  }

  /** Whether an allowed import brought `resolved` into environments of this type. @internal */
  targetAllowed(type: EnvType, resolved: string): boolean {
    if (this.releasedTargets[type].has(resolved)) {
      return true
    }
    for (const env of this.envs.values()) {
      if (env.type === type && !env.allowedImporters(resolved).next().done) {
        return true
      }
    }
    return false
  }

  /** `onViolation` returned `false`, which meant "allow" once. @internal */
  warnOnViolationFalse(): void {
    if (!this.warnedOnViolationFalse) {
      this.warnedOnViolationFalse = true
      console.warn(
        '[import-protection] onViolation returned false, which no longer does anything: onViolation only reports. To give an import the real module, return true from importProtection.allowImport.',
      )
    }
  }

  /**
   * A file was deleted (dev): forget what was recorded of it as an importer,
   * so the session's records stay bounded by the live files.
   */
  forget(path: string): void {
    this.scopeCache.delete(path)
    for (const env of this.envs.values()) {
      env.forget(path)
    }
  }

  /**
   * Keeps the scope-cache entries of the paths `keep` accepts (see
   * `RawFactsCache.retain`); an environment's importer records follow what
   * its compilations hold (`ImportProtectionEnv.hold`).
   */
  retain(keep: (path: string) => boolean): void {
    for (const path of [...this.scopeCache.keys()]) {
      if (!keep(path)) {
        this.scopeCache.delete(path)
      }
    }
  }

  /** Whether an importer path is checked (cached per path). */
  inScope(importerPath: string): boolean {
    return importerInScope(this.config, importerPath, this.scopeCache)
  }

  /**
   * Whether an importer is exempt by `exclude` or `ignoreImporters` (SPEC
   * J6.7): its imports are not checked, but the planner indexes them, so a
   * denied module it imports is allowed (`ImportProtectionEnv.allowsSelf`).
   */
  exempt(importerPath: string): boolean {
    const { exclude, ignoreImporters, root } = this.config
    if (exclude.length === 0 && ignoreImporters.length === 0) {
      return false
    }
    const rel = relativizePath(normalizeFilePath(importerPath), root)
    return (
      matchesAny(rel, exclude) !== undefined ||
      matchesAny(rel, ignoreImporters) !== undefined
    )
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

  /**
   * Rspack: defines the module a request names before it resolves, when its
   * environment does not know it (an importer restored from the persistent
   * cache in a new process: nothing compiled it). The runtime, or an edge
   * module from the content its request carries (`EdgeModuleIds.content`),
   * in its current state; its violations come with the importer's replayed
   * record. Emits what it defines (`onEdgeModule`).
   */
  define(request: string): void {
    const ref = this.ids.parse(request)
    const env = ref && this.envs.get(ref.env)
    if (!env) {
      return
    }
    if (ref.kind === 'runtime') {
      env.defineRuntime()
      return
    }
    const content = this.ids.content?.(request)
    if (content) {
      env.defineModule(ref.key, content)
    }
  }

  /** @internal */
  runtimeLoad(): EdgeModuleLoad {
    return {
      code: mockRuntimeCode(
        this.config.mockAccess,
        this.framework,
        // (the session's own: what the bundler builds the app's modules with)
        process.env.NODE_ENV === 'production',
      ),
      moduleSideEffects: false,
    }
  }

  /** Hands a module's code to the listeners; computed only when one listens (Vite loads it on request). @internal */
  emit(ref: EdgeModuleRef, load: () => EdgeModuleLoad): void {
    if (this.listeners.size === 0) {
      return
    }
    const specifier = this.ids.specifier(ref)
    const code = load()
    for (const l of this.listeners) {
      l(specifier, code, ref)
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
    const rel = normalizePath(path.relative(dir, file))
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
        rule: { type: 'marker' },
      },
      ids.specifier({ env, kind: 'runtime' }),
    ),
    moduleSideEffects: null,
  }
}

/**
 * What an environment handed to the bundler (the served ledger), written when
 * it was handed: an edge module's state (`real`: `allowImport` allowed its
 * import, a transparent re-export), or the verdict on a denied file compiled
 * under its own id (`self`: its own violation; `real`: an unchecked importer
 * imports it, or an allowed import brought it). Every reader (the edge
 * module's code, the witness, the build report) reads it; none decides again.
 */
interface Served {
  verdict: 'mock' | 'real'
  self: EdgeViolation | null
}

/**
 * R147: a denied file compiled under its own id whose importers disagree:
 * one needs it as it is, a checked one reaches the file itself.
 */
interface Conflict {
  self: EdgeViolation
  verdict: 'mock' | 'real'
  needers: Array<string>
  allowed: Array<string>
  /** An allowed import of another environment of this type brought it. */
  elsewhere: boolean
  /** The checked importers that reach the file itself (files). */
  checked: Array<string>
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

/**
 * The outcome of a compile for its host: an error fails the module (dev
 * `behavior: 'error'`); `mock` is served instead of its output (its own
 * violation, `EdgeViolation.self`; `id`: the mock's id among our modules).
 */
export interface CompileOutcome {
  error: Error | null
  mock?: { code: string; id: string }
}

const NO_ERROR: CompileOutcome = { error: null }

/** One Start environment's import protection. */
class ImportProtectionEnv {
  /** Resolved edges of every judged importer (trace steps). */
  readonly edges: EdgeIndex
  /** The bundler's graph (dev: the dev server's module graph; build: set per pass by the witness reader). */
  graph: ImportGraphView | null = null
  /** Dev report queue (`useDevReporter`). */
  reporter: DevReporter | null = null
  private readonly modules = new Map<string, RegisteredModule>()
  private readonly byImporter = new Map<string, Set<string>>()
  private readonly importersByFile = new IdsByFile()
  /** `allowImport`'s answers: one per import (`dedupeKey`) for this environment's session or build. */
  private readonly answers = new Map<string, Promise<boolean>>()
  /**
   * The served ledger (`Served`): an edge module by its key, a denied file
   * compiled under its own id by that id (`normalizePath`).
   */
  private readonly served = new Map<string, Served>()
  /** The imports `onViolation` was told about (`dedupeKey`): per dev session with `log: 'once'`, per build. */
  private readonly notified = new Set<string>()
  /** Dev: pending violations confirmed by the bundler's request (`${importerId}\0${edgeKey}`). */
  private readonly confirmed = new Set<string>()
  private runtimeEmitted = false

  constructor(
    private readonly ip: ImportProtection,
    readonly name: string,
    readonly type: EnvType,
  ) {
    this.edges = new EdgeIndex(ip.readSource)
  }

  /** Dev: print reports through `sink` once the graph knows the importer (`reachable`). */
  useDevReporter(
    sink: ReportSink,
    options?: Pick<DevReporterOptions, 'setTimer' | 'clearTimer'>,
  ): DevReporter {
    this.reporter?.close()
    this.reporter = new DevReporter({
      config: this.ip.config,
      report: this.ip.report,
      sink,
      reachable: (id) => this.reachable(id),
      ...options,
    })
    return this.reporter
  }

  /**
   * Dev `log: 'always'` on a host whose compilation keeps modules it did not
   * compile again (Rspack): the violations of such an importer's record are
   * reported again, as every compilation bundling them reports them.
   */
  async reportAgain(info: unknown): Promise<void> {
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
      if (
        v.env !== this.name ||
        v.behavior !== 'mock' ||
        v.pending ||
        (v.self
          ? this.served.get(normalizePath(v.importerId))?.verdict !== 'mock'
          : await this.allows(v))
      ) {
        continue
      }
      await this.notify(v)
      this.report(v)
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

  /** The whole trace of an importer from the graph as it is now. */
  trace(importerId: string, graph = this.graph): Trace {
    return traceOf(importerId, graph, this.edges)
  }

  /**
   * An asset id (`isAssetId`: `x.ts?raw`, `x.svg?url`, `?inline`, `?worker`)
   * is the file's text and never compiled, so the planner cannot make it its
   * own violation: the same verdict, as the output of a compile, for the host
   * to hand to `afterCompile`. Null when nothing can deny it here. On a
   * server only the static edge is judged: the text or URL of a client-only
   * file runs nothing of it there. The marker is read only for a file of a
   * language (`marker`); a conflict is reported in a compile, which never
   * comes, so it denies the text here.
   */
  async assetOutput(
    id: string,
    marker: (path: string) => Promise<MarkerKind | 'conflict' | null>,
  ): Promise<CompiledOutputLike | null> {
    const { path } = identify(id)
    const { config } = this.ip
    if (
      this.type !== 'client' ||
      id.startsWith('\0') ||
      (NODE_MODULES_RE.test(path) &&
        !this.ip.inScope(path) &&
        !this.ip.exempt(path))
    ) {
      return null
    }
    const rule = await fileOrMarkerRule(config, this.type, path, async (id) => {
      if (identify(id).lang === null) {
        return null
      }
      const m = await marker(id)
      return m === 'conflict' ? 'server-only' : m
    })
    return {
      output: id,
      facts: {
        planners: {
          [IMPORT_EDGES_PLANNER]: {
            violations: {
              [id]: rule
                ? [
                    selfViolationOf(config, this, id, rule, {
                      names: [],
                      hasDefault: true,
                      effectful: false,
                    }),
                  ]
                : [],
            },
          },
        },
      },
    }
  }

  /**
   * After EVERY compile of an id of this environment (fresh or cached):
   * registers the output's edge modules (Rspack: their virtual files are
   * written through `onEdgeModule` before the importer's dependencies
   * resolve) and, in dev, reports the violations it holds and returns the
   * error of `behavior: 'error'` ones (the module must not be served), but
   * for those `allowImport` allows. A module that is its own violation is
   * served as its mock unless it has real demand (`allowsSelf`), and the
   * verdict is written to the served ledger; a build reports a served mock on
   * survival (`surviving`), a dev compile now, as its only violation (its
   * imports reach nothing).
   */
  afterCompile(
    importerId: string,
    out: CompiledOutputLike,
  ): CompileOutcome | Promise<CompileOutcome> {
    const violations = violationsOf(out)
    this.register(importerId, violations)
    if (!(IMPORT_EDGES_PLANNER in out.facts.planners)) {
      // the planner did not run (the module imports nothing now): what it
      // imported before is no edge any more, nor a real demand it made
      this.edges.delete(importerId)
    }
    const dev = this.ip.config.mode === 'dev'
    const self = violations.find((v) => v.self && v.env === this.name)
    if (!self) {
      if (this.served.size > 0) {
        this.served.delete(normalizePath(importerId))
      }
      return violations.length > 0 ? this.answer(violations) : NO_ERROR
    }
    const decided = async (): Promise<CompileOutcome> => {
      const real = await this.allowsSelf(self)
      this.served.set(normalizePath(importerId), {
        verdict: real ? 'real' : 'mock',
        self,
      })
      if (real) {
        return this.answer(violations.filter((v) => v !== self))
      }
      const mock = this.mockOf(self)
      if (!dev || this.explainedByStaleImporter(self)) {
        return { error: null, mock }
      }
      await this.notify(self)
      return { error: this.errorOf(this.report(self)), mock }
    }
    return decided()
  }

  /**
   * `allowImport`'s answers on a compile's imports, asked at the compile (a
   * denied file compiled before the bundler resolves the import then finds
   * it allowed); in dev, the violations it does not allow are reported.
   */
  private answer(
    violations: Array<EdgeViolation>,
  ): CompileOutcome | Promise<CompileOutcome> {
    if (this.ip.config.mode === 'dev') {
      return this.reportDev(violations)
    }
    if (!this.ip.config.allowImport) {
      return NO_ERROR
    }
    return (async () => {
      for (const v of violations) {
        if (v.env === this.name && !v.pending) {
          await this.allows(v)
        }
      }
      return NO_ERROR
    })()
  }

  private async reportDev(
    violations: Array<EdgeViolation>,
  ): Promise<CompileOutcome> {
    const errors: Array<DevReport> = []
    for (const v of violations) {
      if (v.env === this.name && !v.pending && !(await this.allows(v))) {
        await this.notify(v)
        errors.push(...this.report(v))
      }
    }
    return { error: this.errorOf(errors) }
  }

  /** The mock a module that is its own violation is served as. */
  private mockOf(self: EdgeViolation): { code: string; id: string } {
    const key = self.module!.key
    return {
      code: this.edgeLoad(key)!.code,
      id: this.ip.ids.specifier({ env: this.name, kind: 'edge', key }),
    }
  }

  /**
   * `allowImport`'s answer on an import: the one owner of the decision, asked
   * once per import (`dedupeKey`) before anything depends on it. The answer
   * is the state of its edge module (`served`), which brings the module into
   * environments of this type while the import is there
   * (`allowedImporters`); `false` or nothing is the normal outcome under
   * `behavior`.
   */
  private async allows(v: EdgeViolation): Promise<boolean> {
    const { allowImport } = this.ip.config
    if (!allowImport) {
      return false
    }
    const key = dedupeKey(v)
    let answer = this.answers.get(key)
    if (!answer) {
      answer = (async () =>
        (await allowImport(allowImportInfo(v, this.ip.config))) === true)()
      this.answers.set(key, answer)
    }
    const allowed = await answer
    if (v.module && !v.self) {
      this.served.set(v.module.key, {
        verdict: allowed ? 'real' : 'mock',
        self: null,
      })
    }
    return allowed
  }

  /**
   * Whether a module that is its own violation has real demand, known
   * without asking: an allowed import brought it (one module, one identity, in
   * every environment of this type), or an exempt importer imports it (SPEC
   * J6.7: it gets the real module; compiled before the module, its imports
   * are indexed).
   */
  private selfAllowed(self: EdgeViolation): boolean {
    return (
      this.ip.targetAllowed(this.type, self.resolved!) ||
      !this.demanders(self).next().done
    )
  }

  /** The importers (files) that import a module that is its own violation and are not checked: each makes it real. */
  private *demanders(self: EdgeViolation): Generator<string> {
    // (an importer merely outside the scope: only of a file outside it too, R89)
    const inside = this.ip.inScope(traceFile(self.resolved!))
    for (const importerId of this.edges.importers(self.resolved!)) {
      const importer = traceFile(importerId)
      if (!this.ip.inScope(importer) && (!inside || this.ip.exempt(importer))) {
        yield importer
      }
    }
  }

  /**
   * Development: whether an importer whose plan is stale in this environment
   * explains the presence of a module that is its own violation (a module
   * edited to be marked, built before its unchanged importer): the
   * importer's rebuild reports the import or allows it. The module is then
   * stale too, judged again once the importer is built (it is reported if
   * something else still brings it).
   */
  private explainedByStaleImporter(self: EdgeViolation): boolean {
    const stale = this.ip.stale
    if (!stale) {
      return false
    }
    for (const importerId of this.edges.importers(self.resolved!)) {
      if (stale.holds(this.name, traceFile(importerId))) {
        stale.add(this.name, traceFile(self.importerId))
        return true
      }
    }
    return false
  }

  /**
   * `selfAllowed`, or `allowImport`'s answer on the module, which nothing the
   * compiler read imports; read again after the answer (an importer
   * compiled while `allowImport` answered may need the module).
   */
  private async allowsSelf(self: EdgeViolation): Promise<boolean> {
    return (
      this.selfAllowed(self) ||
      (await this.allows(self)) ||
      this.selfAllowed(self)
    )
  }

  /**
   * The importers (files) of this environment whose import of `resolved`
   * `allowImport` allowed and is still there (its edge module served real,
   * with a violation of the importer registered).
   */
  *allowedImporters(resolved: string): Generator<string> {
    for (const [key, entry] of this.served) {
      const m =
        entry.self === null && entry.verdict === 'real'
          ? this.modules.get(key)
          : undefined
      if (m?.content.resolved === resolved) {
        for (const v of m.violations.values()) {
          yield v.importer
        }
      }
    }
  }

  /** The modules the allowed imports still there bring (`allowedImporters`), for `ImportProtection.release`. */
  *allowedTargets(): Generator<string> {
    for (const [key, entry] of this.served) {
      const m =
        entry.self === null && entry.verdict === 'real'
          ? this.modules.get(key)
          : undefined
      if (m?.content.resolved && m.violations.size > 0) {
        yield m.content.resolved
      }
    }
  }

  /** Tells `onViolation` about an import that stayed a violation: once with `log: 'once'` and in a build. */
  private async notify(v: EdgeViolation): Promise<void> {
    const { onViolation, log, mode } = this.ip.config
    if (!onViolation) {
      return
    }
    if (mode === 'build' || log === 'once') {
      const key = dedupeKey(v)
      if (this.notified.has(key)) {
        return
      }
      this.notified.add(key)
    }
    const returned: unknown = await onViolation(
      violationInfo(v, this.ip.config, () => this.trace(v.importerId)),
    )
    if (returned === false) {
      this.ip.warnOnViolationFalse()
    }
  }

  /**
   * Replays an Rspack module's `buildInfo` record (a module restored from the
   * persistent cache): an importer's violations and edges, and what was
   * served (`mismatches` compares it with this compilation's importers). A
   * module compiled in this process wrote its own.
   */
  replay(importerId: string, info: unknown): void {
    const record = info as RspackImportProtectionBuildInfo | undefined
    if (record?.version === 1 && record.env === this.name) {
      const ref = this.ip.ids.parse(importerId)
      if (ref?.kind === 'edge') {
        if (record.served && !this.served.has(ref.key)) {
          this.served.set(ref.key, { verdict: record.served, self: null })
        }
        return
      }
      this.register(importerId, record.violations)
      const self = record.violations.find((v) => v.self)
      if (self && !this.served.has(normalizePath(importerId))) {
        this.served.set(normalizePath(importerId), {
          verdict: record.served ?? 'mock',
          self,
        })
      }
      // a module compiled in this process indexed its edges itself
      if (record.edges && !this.edges.has(importerId)) {
        this.edges.set(importerId, record.edges, record.revision ?? null)
      }
    }
  }

  /** Whether anything was served under the ledger (`mismatches` finds nothing otherwise; most sessions). */
  get serving(): boolean {
    return this.served.size > 0
  }

  /**
   * What the ledger says was served and what the compilation's importers now
   * ask for disagree (design 4, I3): a denied file served the mock whose
   * exempt importer was compiled or restored after it, one served real whose
   * exempt import is gone, a restored edge module or file whose
   * `allowImport` answer (asked once per import, now if not yet) differs. The
   * ids of the modules to build again (an edge module by its id among our
   * modules). Edge modules first: an allowed import brings the module it
   * allows (`allowedImporters`).
   */
  async mismatches(): Promise<Array<string>> {
    const out: Array<string> = []
    for (const [key, entry] of this.served) {
      const m = entry.self ? undefined : this.modules.get(key)
      if (!m) {
        continue
      }
      const [first] = m.violations.values()
      const real = await this.allows(
        first ?? this.violationOfContent(key, m.content),
      )
      if (real !== (entry.verdict === 'real')) {
        // (the state its rebuild loads)
        this.served.set(key, { verdict: real ? 'real' : 'mock', self: null })
        out.push(this.ip.ids.specifier({ env: this.name, kind: 'edge', key }))
      }
    }
    for (const [id, entry] of this.served) {
      if (
        entry.self &&
        (await this.allowsSelf(entry.self)) !== (entry.verdict === 'real')
      ) {
        out.push(id)
      }
    }
    return out
  }

  /**
   * Development: whether an Rspack module's record holds violations this
   * session must report again (a module restored from the persistent cache:
   * another session reported them).
   */
  unjudged(importerId: string, info: unknown): boolean {
    const record = info as RspackImportProtectionBuildInfo | undefined
    return (
      this.ip.config.mode === 'dev' &&
      record?.version === 1 &&
      record.env === this.name &&
      record.violations.length > 0 &&
      !this.byImporter.has(importerId)
    )
  }

  /**
   * Development: whether an edge module of the compilation must be built
   * again by this session: pending violations it never confirmed were another
   * session's to report.
   */
  unconfirmed(resource: string): boolean {
    if (this.ip.config.mode !== 'dev') {
      return false
    }
    const ref = this.ip.ids.parse(resource)
    const m =
      ref?.kind === 'edge' && ref.env === this.name
        ? this.modules.get(ref.key)
        : undefined
    if (!m) {
      return false
    }
    for (const [key, v] of m.violations) {
      if (v.pending && !this.confirmed.has(key)) {
        return true
      }
    }
    return false
  }

  /** What the Rspack loader stores in `buildInfo[RSPACK_BUILD_INFO_KEY]` for a compiled output (null: nothing). */
  buildInfo(
    importerId: string,
    out: CompiledOutputLike,
  ): {
    key: string
    value: RspackImportProtectionBuildInfo
  } | null {
    const violations = violationsOf(out)
    const edges = this.edges.edgesOf(importerId)
    const revision = this.edges.revisionOf(importerId)
    const served = this.served.get(normalizePath(importerId))?.verdict
    return violations.length > 0 || edges.length > 0
      ? {
          key: RSPACK_BUILD_INFO_KEY,
          value: {
            version: 1,
            env: this.name,
            violations,
            ...(edges.length > 0 && { edges }),
            ...(revision !== null && { revision }),
            ...(served && { served }),
          },
        }
      : null
  }

  /** What the Rspack loader stores in an edge module's `buildInfo`: the state it was served in (null: never decided, the mock). */
  edgeBuildInfo(
    id: string,
  ): { key: string; value: RspackImportProtectionBuildInfo } | null {
    const ref = this.ip.ids.parse(id)
    const served = ref?.kind === 'edge' && this.served.get(ref.key)?.verdict
    return served
      ? {
          key: RSPACK_BUILD_INFO_KEY,
          value: { version: 1, env: this.name, violations: [], served },
        }
      : null
  }

  private register(importerId: string, violations: Array<EdgeViolation>): void {
    const keys = new Set<string>()
    for (const v of violations) {
      if (v.env !== this.name || !v.module) {
        continue
      }
      keys.add(v.module.key)
      this.defineModule(v.module.key, v.module.content).violations.set(
        `${v.importerId}\u0000${v.edgeKey}`,
        v,
      )
    }
    const previous = this.byImporter.get(importerId)
    if (!previous) {
      this.importersByFile.add(importerId)
    }
    this.byImporter.set(importerId, keys)
    if (previous) {
      for (const key of previous) {
        if (!keys.has(key)) {
          this.release(importerId, key)
        }
      }
    }
  }

  /** Dev: queues a mock report; returns the report of an `error` violation (the importer must fail). */
  private report(v: EdgeViolation): Array<DevReport> {
    const info = violationInfo(v, this.ip.config, () =>
      this.trace(v.importerId),
    )
    if (v.behavior === 'error') {
      return [{ violation: v, info }]
    }
    this.reporter?.enqueue({ violation: v, info })
    return []
  }

  private errorOf(errors: Array<DevReport>): Error | null {
    return errors.length === 0
      ? null
      : devViolationError(errors, this.ip.report)
  }

  /**
   * The bundler requested an edge module from the transformed importer, so
   * the import survived its TypeScript transform, and the module is about to
   * load: `allowImport` decides now (its transparent state or the mock). In
   * dev, the pending violations of a module it does not allow are reported,
   * or returned as the error the importer fails with (`behavior: 'error'`).
   * Null, synchronously, when there is nothing to do (the common case).
   */
  /** The module an edge module `allowImport` allowed re-exports (by its facts id); null for any other id. */
  allowedTarget(id: string): string | null {
    const ref = this.ip.ids.parse(id)
    return ref?.kind === 'edge' && this.served.get(ref.key)?.verdict === 'real'
      ? (this.modules.get(ref.key)?.content.resolved ?? null)
      : null
  }

  confirm(id: string): Promise<Error | null> | null {
    const ref = this.ip.ids.parse(id)
    if (ref?.kind !== 'edge') {
      return null
    }
    const m = this.modules.get(ref.key)
    if (!m) {
      return null
    }
    const pending: Array<[string, EdgeViolation]> = []
    if (this.ip.config.mode === 'dev') {
      for (const [key, v] of m.violations) {
        // an `error` violation fails every request (its importer is not cached)
        if (
          v.pending &&
          (v.behavior === 'error' ||
            this.ip.config.log === 'always' ||
            !this.confirmed.has(key))
        ) {
          pending.push([key, v])
        }
      }
    }
    if (pending.length === 0 && !this.ip.config.allowImport) {
      return null
    }
    return (async () => {
      const [first] = m.violations.values()
      // (a module's own mock is not asked here: `allowsSelf` chose it)
      if (
        !first?.self &&
        (await this.allows(
          first ?? this.violationOfContent(ref.key, m.content),
        ))
      ) {
        for (const [key] of pending) {
          this.confirmed.add(key)
        }
        return null
      }
      const errors: Array<DevReport> = []
      for (const [key, v] of pending) {
        this.confirmed.add(key)
        await this.notify(v)
        errors.push(...this.report(v))
      }
      return this.errorOf(errors)
    })()
  }

  /**
   * Rspack: a request of an import-protection module in a child compiler of
   * this environment (a worker or service-worker plugin's). The modules are
   * virtual files of the environment's compiler, which a child compiler
   * cannot load, so every violation the request stands for (an edge
   * module's, of its importer; the runtime's, of the module that is its own
   * violation) fails the build: told to `onViolation` and returned as its
   * report. Null for any other request, or when no violation is known.
   */
  async childCompilerRequest(
    request: string,
    issuer: string | undefined,
  ): Promise<Array<string> | null> {
    const ref = this.ip.ids.parse(request)
    if (ref?.env !== this.name || !issuer) {
      return null
    }
    const file = normalizePath(issuer)
    const ofImporter = (v: EdgeViolation) => traceFile(v.importerId) === file
    let violations: Array<EdgeViolation>
    if (ref.kind === 'edge') {
      const m = this.modules.get(ref.key)
      violations = m
        ? [...m.violations.values()].filter((v) => !v.self && ofImporter(v))
        : []
      if (m && violations.length === 0) {
        violations.push(this.violationOfContent(ref.key, m.content))
      }
    } else {
      violations = [...this.modules.values()].flatMap((one) =>
        [...one.violations.values()].filter((v) => v.self && ofImporter(v)),
      )
    }
    if (violations.length === 0) {
      return null
    }
    const reports: Array<string> = []
    for (const v of violations) {
      const denied = { ...v, behavior: 'error' as const }
      await this.notify(denied)
      const info = violationInfo(denied, this.ip.config, () =>
        this.trace(v.importerId),
      )
      reports.push(
        formatViolation(denied, info, this.ip.report, {
          childCompiler: true,
        }),
      )
    }
    return reports
  }

  /** The violation an edge module stands for when no record of it was read: an importer restored from a persistent cache. */
  private violationOfContent(
    key: string,
    content: EdgeModuleContent,
  ): EdgeViolation {
    const importer = path.resolve(this.ip.config.root, content.importer)
    return {
      edgeKey: content.edgeKey,
      env: this.name,
      envType: this.type,
      rule: content.rule,
      specifier: content.specifier,
      importer,
      importerId: importer,
      resolved: content.resolved,
      loc: null,
      snippet: null,
      behavior: this.ip.config.behavior,
      module: { key, content },
    }
  }

  /** An edge module of this environment: registered (and emitted, the runtime first) unless it is known. @internal */
  defineModule(key: string, content: EdgeModuleContent): RegisteredModule {
    let m = this.modules.get(key)
    if (!m) {
      m = { content, violations: new Map() }
      this.modules.set(key, m)
      this.defineRuntime()
      this.ip.emit(
        { env: this.name, kind: 'edge', key },
        () => this.edgeLoad(key)!,
      )
    }
    return m
  }

  /** The environment's mock runtime, emitted once. @internal */
  defineRuntime(): void {
    if (!this.runtimeEmitted) {
      this.runtimeEmitted = true
      this.ip.emit({ env: this.name, kind: 'runtime' }, () =>
        this.ip.runtimeLoad(),
      )
    }
  }

  /**
   * Forgets the importer records (edges, violations, served verdict) of the
   * module ids a compilation that just finished building does not hold
   * (`holds`, by module id: one file has an id per output): an importer the
   * app no longer imports, or a split-out part of a file that no longer
   * exists, asks for nothing (real demand, an allowed import). A module
   * that comes back is compiled or restored again, with its records.
   */
  hold(holds: (id: string) => boolean): void {
    for (const importerId of [...this.edges.ids()]) {
      if (!holds(importerId)) {
        this.edges.delete(importerId)
      }
    }
    for (const importerId of [...this.byImporter.keys()]) {
      if (!holds(importerId)) {
        this.importersByFile.delete(importerId)
        this.forgetImporter(importerId)
      }
    }
  }

  /** Forgets a deleted file's importer records (edges, violations of its ids). `allowImport` is asked once per import for the session: its answers stay. */
  forget(path: string): void {
    this.edges.forget(path)
    for (const importerId of this.importersByFile.take(path)) {
      this.forgetImporter(importerId)
    }
  }

  private forgetImporter(importerId: string): void {
    this.served.delete(normalizePath(importerId))
    const keys = this.byImporter.get(importerId)
    this.byImporter.delete(importerId)
    for (const key of keys ?? []) {
      this.release(importerId, key)
    }
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

  /** The code of an edge module of this environment in its current state (the mock unless `allowImport` allowed its edge). */
  edgeLoad(key: string): EdgeModuleLoad | null {
    const m = this.modules.get(key)
    if (!m) {
      return unknownEdgeLoad(this.name, key, this.ip.ids)
    }
    const runtime = this.ip.ids.specifier({ env: this.name, kind: 'runtime' })
    const c = m.content
    if (this.served.get(key)?.verdict === 'real') {
      return {
        code: allowedModuleCode(c, c.resolved ?? c.specifier),
        moduleSideEffects: null,
      }
    }
    return { code: mockModuleCode(c, runtime), moduleSideEffects: null }
  }

  /**
   * The witness readers' view of this environment's edge modules and of the
   * modules that are their own violation, as the ledger says they were
   * served: one served real (an allowed edge, a file with real demand) is no
   * violation.
   */
  witness(): WitnessLookup {
    const mockOf = (key: string) => {
      const m = this.modules.get(key)
      return m && this.served.get(key)?.verdict !== 'real'
        ? m.content.effectful
        : null
    }
    const edges = witnessLookup(this.ip.ids, this.name, mockOf)
    return (id) => {
      const served = this.served.get(normalizePath(id))
      if (served?.self && served.verdict === 'mock') {
        const key = served.self.module!.key
        const m = this.modules.get(key)
        if (m) {
          return { key, effectful: m.content.effectful }
        }
      }
      return edges(id)
    }
  }

  /**
   * R147: the denied files compiled under their own id (`holds`: those the
   * build holds) whose importers disagree in `graph`: one needs the file as
   * it is (an exempt or unchecked importer, an import `allowImport` allowed),
   * and a checked importer reaches the file itself (a pattern import, an
   * import another plugin added: it cannot get a mock of its own). Read
   * once the graph is complete, so the result does not depend on the order
   * the bundler compiled them in.
   */
  conflicts(
    graph: ImportGraphView,
    holds?: (id: string) => boolean,
  ): Map<string, Conflict> {
    const out = new Map<string, Conflict>()
    for (const [id, entry] of this.served) {
      const self = entry.self
      if (!self || (holds && !holds(id))) {
        continue
      }
      const needers = [...new Set(this.demanders(self))]
      const allowed = [...new Set(this.allowedImporters(self.resolved!))]
      const elsewhere =
        needers.length === 0 &&
        allowed.length === 0 &&
        this.ip.targetAllowed(this.type, self.resolved!)
      if (needers.length === 0 && allowed.length === 0 && !elsewhere) {
        continue
      }
      const checked = new Set<string>()
      for (const importerId of graph.importers(self.importerId)) {
        const importer = traceFile(importerId)
        if (
          this.ip.ids.parse(importerId) === null &&
          this.ip.inScope(importer)
        ) {
          checked.add(importer)
        }
      }
      if (checked.size > 0) {
        out.set(id, {
          self,
          verdict: entry.verdict,
          needers,
          allowed,
          elsewhere,
          checked: [...checked],
        })
      }
    }
    return out
  }

  private formatConflict(c: Conflict): {
    severity: 'error'
    message: string
    info: ViolationInfo
  } {
    const info = violationInfo(c.self, this.ip.config, () => ({
      steps: [],
      fromEntry: false,
    }))
    return {
      severity: 'error',
      message: formatServedConflict(
        info,
        c,
        c.checked,
        c.verdict,
        this.ip.report,
      ),
      info: info as ViolationInfo,
    }
  }

  /** The R147 messages printed by `newConflictReports` (dev), until the conflict changes or goes. */
  private readonly shownConflicts = new Set<string>()

  /**
   * Dev: the R147 errors of the ledger's files in the dev server's graph as
   * it is now (none until it has one): every one (`all`: a host whose
   * compilations each hold their errors, Rspack), or those not printed yet
   * (a host printing to its log, Vite). The ledger keeps serving as it says.
   */
  conflictReports(all: boolean): Array<string> {
    if (!this.graph || this.served.size === 0) {
      return []
    }
    const messages = [...this.conflicts(this.graph).values()].map(
      (c) => this.formatConflict(c).message,
    )
    if (all) {
      return messages
    }
    const fresh = messages.filter((m) => !this.shownConflicts.has(m))
    this.shownConflicts.clear()
    for (const m of messages) {
      this.shownConflicts.add(m)
    }
    return fresh
  }

  /** A rebuild of `build --watch`: `onViolation` hears about what survives it again. */
  beginBuild(): void {
    if (this.ip.config.mode === 'build') {
      this.notified.clear()
    }
  }

  /**
   * A build output's verdict: the surviving edge modules (`liveKeys`, from
   * `readRolldownWitness`/`readRspackWitness`) tell which violations stayed;
   * `onViolation` hears about each with its trace in `graph`, and the reports
   * are returned, formatted (`error` behaviour: the build fails with them;
   * `mock`: warnings). `holds`: the module ids of the build, from a host that
   * cannot build a module again (a Vite build): a denied file it holds that
   * was served otherwise than its importers now ask for (`mismatches`) is
   * reported as such under `behavior`, instead of its other reports (design
   * 4's I3; the Rspack host builds it again before this runs).
   */
  async surviving(
    liveKeys: ReadonlyArray<string>,
    graph: ImportGraphView,
    holds?: (id: string) => boolean,
  ): Promise<
    Array<{
      severity: 'error' | 'warning'
      message: string
      info: ViolationInfo
    }>
  > {
    this.graph = graph
    // R147 first: it replaces the file's other reports
    const conflicts = this.served.size > 0 ? this.conflicts(graph, holds) : null
    const unsettled = new Map<string, Served>()
    if (holds) {
      const survived = new Set(liveKeys)
      for (const id of await this.mismatches()) {
        const entry = this.served.get(id)
        if (
          entry?.self &&
          holds(id) &&
          !conflicts?.has(id) &&
          // (a mock nothing of the build kept harms no importer)
          (entry.verdict === 'real' || survived.has(entry.self.module!.key))
        ) {
          unsettled.set(id, entry)
        }
      }
    }
    // the mocked modules that are their own violation whose every importer is not checked (R89), with those importers
    const unchecked = new Map<string, [EdgeViolation, Array<string>]>()
    // those nothing in the graph imports: no supported configuration has one
    // (one entry per environment; a dev server reports the file when it
    // compiles it), so no report accounts for it (design 4, I5)
    const unaccounted: Array<EdgeViolation> = []
    const live = new Map<string, EdgeViolation>()
    const add = (v: EdgeViolation) => {
      const key = dedupeKey(v)
      if (!live.has(key)) {
        live.set(key, v)
      }
    }
    for (const key of liveKeys) {
      for (const v of this.modules.get(key)?.violations.values() ?? []) {
        if (!v.self) {
          add(v)
          continue
        }
        const id = normalizePath(v.importerId)
        // (the witness finds a served mock; the key may stand for other ids too)
        if (
          this.served.get(id)?.verdict !== 'mock' ||
          unsettled.has(id) ||
          conflicts?.has(id)
        ) {
          continue
        }
        const importers = [...graph.importers(v.importerId)]
        const checked = this.importsOf(v, importers)
        checked.forEach(add)
        const others = importers.filter((id) => this.ip.ids.parse(id) === null)
        if (!checked.length && others.length) {
          unchecked.set(v.edgeKey, [v, [...new Set(others.map(traceFile))]])
        } else if (!checked.length) {
          unaccounted.push(v)
        }
      }
    }
    const reports = []
    // not violations (no `onViolation`), and errors under both behaviors
    for (const c of conflicts?.values() ?? []) {
      reports.push(this.formatConflict(c))
    }
    for (const key of [...live.keys()].sort()) {
      const v = live.get(key)!
      await this.notify(v)
      const info = violationInfo(v, this.ip.config, () =>
        this.trace(v.importerId, graph),
      )
      reports.push({
        severity:
          v.behavior === 'error' ? ('error' as const) : ('warning' as const),
        message: formatViolation(v, info, this.ip.report),
        info: info as ViolationInfo,
      })
    }
    // not violations (no `onViolation`, no failure): a warning per module
    for (const [v, importers] of unchecked.values()) {
      const info = violationInfo(v, this.ip.config, () => ({
        steps: [],
        fromEntry: false,
      }))
      const message = formatUncheckedImporters(info, importers, this.ip.report)
      reports.push({
        severity: 'warning' as const,
        message,
        info: info as ViolationInfo,
      })
    }
    for (const v of unaccounted) {
      const iv = invariantViolated({
        effect: 'a denied file was replaced by its mock, which nothing reports',
        detail: `import protection: the mock of ${v.importerId} survived with no importer in the build's graph`,
      })
      reports.push({
        severity: 'warning' as const,
        message: invariantDiagnostic(
          '[tanstack-start] ',
          relativizePath(v.importer, this.ip.config.root),
          iv,
        ).message,
        info: violationInfo(v, this.ip.config, () => ({
          steps: [],
          fromEntry: false,
        })) as ViolationInfo,
      })
    }
    // not violations either, but the build shipped what no importer asked for
    for (const { verdict, self } of unsettled.values()) {
      const v = self!
      const info = violationInfo(v, this.ip.config, () => ({
        steps: [],
        fromEntry: false,
      }))
      const needers = verdict === 'mock' ? [...this.demanders(v)] : []
      const others = [...graph.importers(v.importerId)]
        .filter((i) => this.ip.ids.parse(i) === null)
        .map(traceFile)
        .filter((file) => !needers.includes(file))
      reports.push({
        severity:
          v.behavior === 'error' ? ('error' as const) : ('warning' as const),
        message: formatServedMismatch(
          info,
          verdict,
          needers,
          [...new Set(others)],
          this.ip.report,
        ),
        info: info as ViolationInfo,
      })
    }
    return reports
  }

  /**
   * Build: the violations a module's own violation stands for, one per module
   * of the graph importing it that import protection checks (our own modules
   * aside).
   */
  private importsOf(
    self: EdgeViolation,
    importers: Iterable<string> = [],
  ): Array<EdgeViolation> {
    const { self: _self, ...violation } = self
    const out: Array<EdgeViolation> = []
    for (const importerId of new Set(importers)) {
      const importer = traceFile(importerId)
      if (
        this.ip.ids.parse(importerId) !== null ||
        !this.ip.inScope(importer)
      ) {
        continue
      }
      out.push({
        ...violation,
        edgeKey: `${self.edgeKey}\u0000${importerId}`,
        importer,
        importerId,
        ...this.patternImportOf(importer, self.resolved!),
      })
    }
    return out
  }

  /**
   * Where an importer's pattern import reached a module that is its own
   * violation: the call in its raw text (`import.meta.glob`, …), its
   * position and code frame. Read once the violation survived (a report).
   */
  private patternImportOf(
    importer: string,
    resolved: string,
  ): Pick<EdgeViolation, 'pattern' | 'loc' | 'snippet'> {
    const text = this.ip.readSource(importer)
    const found =
      text === null
        ? null
        : findPatternImport(
            text,
            importer,
            identify(resolved).path,
            this.ip.config.root,
          )
    if (text === null || found === null) {
      return { pattern: found, loc: null, snippet: null }
    }
    const locator = new Locator(text, importer, () => null)
    const loc = locator.at(found.offset)
    return { pattern: found, loc, snippet: loc && locator.frame(loc) }
  }
}
