/**
 * The import-protection facade a Start host owns for one session (a dev
 * server or a build): the resolved config, the `import-edges` planner, one
 * `ImportProtectionEnv` per Start environment (edge modules, the
 * `allowImport` decision, dev and build reports, traces), and the edge modules' code. Host-agnostic: the
 * Vite and Rspack hosts call it from their hooks.
 */
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
  RSPACK_BUILD_INFO_VERSION,
  allowImportInfo,
  clientReferencesOf,
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
  ProductionMock,
} from './edge-modules'
import type { GraphNode, NodeGraph, SourceReader, Trace } from './graph-trace'
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
  /** Reads a file (a package's `package.json` for `sideEffects`); null when it can't be read. */
  readFile: (file: string) => Promise<string | null>
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
  /** Whether the app renders React Server Components (`ReportContext.rsc`). */
  rsc?: boolean
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
        opts.readFile,
        opts.isEntry ?? (() => false),
        opts.readSource,
        opts.framework,
        opts.rsc ?? false,
      )
    : null
}

/**
 * Whether a module id is one of `ids` (a compilation's modules): as given
 * (most ids are already in the form the hosts record), else compared as the
 * compiler keys an output, `key` (default: its canonical id with its owned
 * query for a derived one; a host passes its own canonical form first)
 * (`ImportProtectionEnv.hold`). The second form is built on the first miss
 * only: an id that left the compilation is rare.
 */
export function heldIn(
  ids: Iterable<string>,
  key: (id: string) => string = outputKey,
): (id: string) => boolean {
  const held = new Set(ids)
  let keys: Set<string> | null = null
  return (id) => {
    if (held.has(id)) {
      return true
    }
    keys ??= new Set([...held].map(key))
    return keys.has(key(id))
  }
}

/** An output's key: its canonical id, with its owned query for a derived output. */
export function outputKey(id: string): string {
  const identity = identify(normalizePath(id))
  return identity.derived
    ? deriveId(identity.canonicalId, identity.derived)
    : identity.canonicalId
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
   * imports it (from plugin code), and a build releases the first
   * environment before the next one builds.
   */
  private readonly releasedTargets: Record<EnvType, Set<string>> = {
    client: new Set(),
    server: new Set(),
  }
  private warnedOnViolationFalse = false
  /** The type of each compile environment (`addEnvironment`): a released one starts over with it. */
  private readonly types = new Map<string, EnvType>()
  /** The name reports give an environment whose key is not it (`addEnvironment`). */
  private readonly publicNames = new Map<string, string>()
  /**
   * The client-reference handoff (`addEnvironment`): by environment that
   * renders server components, the one that renders their client
   * references on the server.
   */
  private readonly clientReferencesInto = new Map<string, string>()
  /** Environments whose release waits for their handoff's destination's (`release`). */
  private readonly releaseWithInto = new Set<string>()
  /**
   * By the environment name reports give, `allowImport`'s answers: one per
   * import (`dedupeKey`) for its session or build, shared by the compile
   * environments of one name (an Rsbuild user layer and its compiler's).
   */
  private readonly answers = new Map<string, Map<string, Promise<boolean>>>()
  /** By the environment name reports give, the imports `onViolation` was told about (`dedupeKey`): per dev session with `log: 'once'`, per build. */
  private readonly notified = new Map<string, Set<string>>()
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
    rsc = false,
  ) {
    this.planner = importEdgesPlanner(this)
    this.report = { config, readSource, framework, rsc }
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

  /**
   * A compile environment (by key) and its type; `publicName`: the name
   * reports and callbacks give it (default: its key);
   * `clientReferencesInto`: where it renders server components, the
   * environment the bundler brings the `'use client'` files they import to
   * (the client-reference handoff: `EdgeViolation.handoff`).
   */
  addEnvironment(
    name: string,
    type: EnvType,
    publicName?: string,
    clientReferencesInto?: string,
  ): void {
    this.types.set(name, type)
    if (publicName !== undefined && publicName !== name) {
      this.publicNames.set(name, publicName)
    }
    if (clientReferencesInto !== undefined) {
      this.clientReferencesInto.set(name, clientReferencesInto)
    }
  }

  /** The state of a compile environment (`addEnvironment`), by key. */
  env(name: string): ImportProtectionEnv {
    let env = this.envs.get(name)
    if (!env) {
      const type = this.types.get(name)
      if (!type) {
        throw new Error(`[import-protection] unknown environment "${name}"`)
      }
      env = new ImportProtectionEnv(this, name, type)
      this.envs.set(name, env)
    }
    return env
  }

  /**
   * Releases an environment's state once its build is finished (edges,
   * edge modules, verdicts): nothing later reads it, and a later compile in
   * the environment starts over (`env`). An environment whose client
   * references another one renders is released with it: that one's
   * verdicts read its handoff records (a Vite build builds `rsc` first).
   */
  release(name: string): void {
    const into = this.clientReferencesInto.get(name)
    if (into !== undefined && this.envs.has(into)) {
      this.releaseWithInto.add(name)
      return
    }
    this.releaseNow(name)
    for (const [source, dest] of this.clientReferencesInto) {
      if (dest === name && this.releaseWithInto.delete(source)) {
        this.releaseNow(source)
      }
    }
  }

  private releaseNow(name: string): void {
    const env = this.envs.get(name)
    if (env) {
      for (const target of env.allowedTargets()) {
        this.releasedTargets[env.type].add(target)
      }
    }
    this.envs.delete(name)
    const publicName = this.publicNameOf(name)
    if (
      ![...this.envs.keys()].some((k) => this.publicNameOf(k) === publicName)
    ) {
      // (another build of the name asks again)
      this.answers.delete(publicName)
      this.notified.delete(publicName)
    }
  }

  /** A live compile environment's state, by key (none: not created yet, or released). @internal */
  liveEnv(name: string): ImportProtectionEnv | undefined {
    return this.envs.get(name)
  }

  /** The edges import protection recorded in an environment (traces). @internal */
  edgesOf(name: string): EdgeIndex | null {
    return this.envs.get(name)?.edges ?? null
  }

  /**
   * The environments whose client references environment `dest` renders,
   * of which `target` is one (`addEnvironment`'s `clientReferencesInto`).
   * @internal
   */
  handoffSources(dest: string, target: string): Array<ImportProtectionEnv> {
    const out: Array<ImportProtectionEnv> = []
    for (const [source, into] of this.clientReferencesInto) {
      const env = into === dest ? this.envs.get(source) : undefined
      if (env?.clientReferences.has(normalizePath(target))) {
        out.push(env)
      }
    }
    return out
  }

  /**
   * The importers of a module through the client-reference handoff: of
   * the module of its file in each environment whose client references it
   * is (`handoffSources`), from `graph`, else from that environment's
   * records. @internal
   */
  *handoffImporters(
    node: GraphNode,
    graph: NodeGraph | null,
  ): Generator<GraphNode> {
    for (const source of this.handoffSources(node.env, node.id)) {
      yield* graph?.importers({ env: source.name, id: node.id }) ??
        [...source.edges.importers(node.id)].map((id) => ({
          env: source.name,
          id,
        }))
    }
  }

  /** The name reports and callbacks give a compile environment. @internal */
  publicNameOf(name: string): string {
    return this.publicNames.get(name) ?? name
  }

  /** `allowImport`'s answers of an environment name (`answers`). @internal */
  answersOf(publicName: string): Map<string, Promise<boolean>> {
    let answers = this.answers.get(publicName)
    if (!answers) {
      answers = new Map()
      this.answers.set(publicName, answers)
    }
    return answers
  }

  /** The imports `onViolation` was told about, of an environment name (`notified`). @internal */
  notifiedOf(publicName: string): Set<string> {
    let notified = this.notified.get(publicName)
    if (!notified) {
      notified = new Set()
      this.notified.set(publicName, notified)
    }
    return notified
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
      return this.runtimeLoad(ref.env)
    }
    const env = this.envs.get(ref.env)
    return env
      ? env.edgeLoad(ref.key)
      : unknownEdgeLoad(
          ref.env,
          ref.key,
          this.ids,
          this.productionMock,
          this.publicNameOf(ref.env),
        )
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

  /**
   * Whether the mocks and their runtime are production's: a build's carry
   * only what the runtime's one-line report reads; a dev server's carry the
   * importer and the longer text. @internal
   */
  get production(): boolean {
    return this.config.mode === 'build'
  }

  /** What a production mock's metadata is made of; null in dev. @internal */
  get productionMock(): ProductionMock | null {
    return this.production ? this.config : null
  }

  /** The mock runtime of the environment `env`. @internal */
  runtimeLoad(env: string): EdgeModuleLoad {
    return {
      code: mockRuntimeCode(
        this.config.mockAccess,
        this.framework,
        this.production,
        env,
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
  production: ProductionMock | null,
  publicName: string,
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
      production,
      publicName,
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
  /**
   * An edge module's state read from a restored module's record (Rspack's
   * persistent cache: another session's answer), until this session's
   * `allowImport` answer replaces it (`mismatches`). Any other edge state was
   * written from this session's answer on the module's one import
   * (`dedupeKey`), asked once and remembered: it never differs.
   */
  restored?: true
  /**
   * A denied file's verdict as the compilation's finished graph gives it
   * (`mismatches(graph)`: Rsbuild's `finishMake`), which its next compiles
   * serve until the next settlement: the edges a compile reads in its own
   * environment can disagree with the graph (an exempt importer whose
   * import a user's rule moved to another layer's module).
   */
  settled?: boolean
}

/**
 * A checked importer whose import reaches a denied file compiled under its
 * own id (`Incoming.checked`): an import the compiler does not read (a
 * pattern import, an import another plugin added), or a denied
 * client-reference import (`handoff`: its violation).
 */
interface CheckedEdge {
  /** The importer's file. */
  importer: string
  importerId: string
  /** The importer's compile environment. */
  env: string
  handoff?: EdgeViolation
}

/**
 * The edges that arrive at a denied file compiled under its own id, each
 * classified by the records of its own environment (`incoming`).
 */
interface Incoming {
  /** The unchecked importers (files) whose import of it the compiler read: each makes it real (SPEC J6.7, R89). */
  exempt: Set<string>
  /** The importers (files) whose import of it `allowImport` allowed. */
  allowed: Set<string>
  /** The checked importers that reach the file itself. */
  checked: Array<CheckedEdge>
  /** The unchecked importers (files) that reach it through an import the compiler does not read. */
  unread: Set<string>
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
  /** The checked importers that reach the file itself. */
  checked: Array<CheckedEdge>
  /**
   * The unchecked importers that reach the file itself, through an import
   * the compiler does not read (an exempt pattern import, an import another
   * plugin added): no conflict, but a Vite build serves the file as it
   * compiled it first (files).
   */
  unread: Array<string>
}

/**
 * A registered edge, by its key (`ImportProtectionEnv.modules`): the
 * import's state, of which an edge module is one form; a client-reference
 * handoff has none until its target stops being one (`emitted`). The
 * names (`modules`, `defineModule`) still say module for what holds edges.
 */
interface RegisteredModule {
  content: EdgeModuleContent
  /** Violations importing it, by `${importerId}\0${edgeKey}`. */
  violations: Map<string, EdgeViolation>
  /** Whether its code was handed to the listeners (a handoff's key has no module: `EdgeViolation.handoff`). */
  emitted: boolean
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

/** The trace of a report that prints none (each `violationInfo` copies it). */
const NO_TRACE: Trace = { steps: [], fromEntry: false }

/**
 * One compile environment's import protection: its edges, edge modules,
 * served ledger and importer records (an Rsbuild layer's module of a file
 * is the layer environment's).
 */
class ImportProtectionEnv {
  /** Resolved edges of every judged importer (trace steps). */
  readonly edges: EdgeIndex
  /** The bundler's graph (dev: the dev server's module graphs; build: the compilation's, set per pass by the witness reader). */
  graph: NodeGraph | null = null
  /** The modules (canonical ids) that are client references here (`ImportEdgesFacts.clientReferences`). @internal */
  readonly clientReferences = new Set<string>()
  /** Dev report queue (`useDevReporter`). */
  reporter: DevReporter | null = null
  private readonly modules = new Map<string, RegisteredModule>()
  /** The edge modules of each importer's last compile, by importer id. */
  private readonly byImporter = new Map<
    string,
    { importerId: string; keys: Set<string> }
  >()
  private readonly importersByFile = new IdsByFile()
  /**
   * The served ledger (`Served`): an edge module by its key, a denied file
   * compiled under its own id by that id (`normalizePath`).
   */
  private readonly served = new Map<string, Served>()
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

  /** What reports and callbacks call this environment (`info.env`). */
  get publicName(): string {
    return this.ip.publicNameOf(this.name)
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
      record?.version !== RSPACK_BUILD_INFO_VERSION ||
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
        // (a denied handoff is reported with the module it brings)
        v.handoff ||
        (v.self
          ? this.served.get(normalizePath(v.importerId))?.verdict !== 'mock'
          : await this.allows(v))
      ) {
        continue
      }
      for (const { v: reported, owner } of this.devReportsOf(v)) {
        await owner.notify(reported)
        owner.report(reported)
      }
    }
  }

  /** Whether the graph knows how `importerId` is reached. */
  reachable(importerId: string): boolean {
    const g = this.graph
    if (!g) {
      return false
    }
    const node = { env: this.name, id: importerId }
    if (g.isEntry(node)) {
      return true
    }
    for (const importers of [
      (g.walkImporters ?? g.importers)(node) ??
        this.edges.importers(importerId),
      this.ip.handoffImporters(node, g),
    ]) {
      for (const _ of importers) {
        return true
      }
    }
    return false
  }

  /** The whole trace of an importer from the graph as it is now. */
  trace(importerId: string, graph = this.graph): Trace {
    return traceOf(
      { env: this.name, id: importerId },
      graph,
      (env) => this.ip.edgesOf(env),
      (node) => this.ip.handoffImporters(node, graph),
    )
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
    if (clientReferencesOf(out)) {
      this.clientReferences.add(normalizePath(importerId))
    } else if (this.clientReferences.size > 0 && out.output === 'env') {
      this.clientReferences.delete(normalizePath(importerId))
    }
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
      const id = normalizePath(importerId)
      // (the graph's verdict of the last settlement, else the guess)
      const settled = this.served.get(id)?.settled
      const real = settled ?? (await this.allowsSelf(self))
      this.served.set(id, {
        verdict: real ? 'real' : 'mock',
        self,
        ...(settled !== undefined && { settled }),
      })
      if (real) {
        return this.answer(violations.filter((v) => v !== self))
      }
      const mock = this.mockOf(self)
      if (!dev || this.explainedByStaleImporter(self)) {
        return { error: null, mock }
      }
      const errors: Array<DevReport> = []
      for (const { v, owner } of this.devReportsOf(self)) {
        await owner.notify(v)
        errors.push(...owner.report(v))
      }
      return { error: this.errorOf(errors), mock }
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
      if (
        v.env === this.name &&
        !v.pending &&
        !(await this.allows(v)) &&
        // (a denied handoff is reported when the module it brings compiles
        // as its mock: `devReportsOf`)
        !v.handoff
      ) {
        await this.notify(v)
        errors.push(...this.report(v))
      }
    }
    return { error: this.errorOf(errors) }
  }

  /**
   * Dev: what a module that is its own violation, served its mock, is
   * reported as: the denied client-reference imports that bring it (each
   * of its own environment, at its position), else itself.
   */
  private devReportsOf(
    self: EdgeViolation,
  ): Array<{ v: EdgeViolation; owner: ImportProtectionEnv }> {
    const out: Array<{ v: EdgeViolation; owner: ImportProtectionEnv }> = []
    for (const c of this.incoming(self, null).checked) {
      const owner = c.handoff && this.ip.liveEnv(c.env)
      if (owner) {
        out.push({ v: c.handoff!, owner })
      }
    }
    return out.length > 0 ? out : [{ v: self, owner: this }]
  }

  /** The mock a module that is its own violation is served as. */
  private mockOf(self: EdgeViolation): { code: string; id: string } {
    const key = self.module.key
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
    const { publicName } = this
    const answers = this.ip.answersOf(publicName)
    const key = dedupeKey(v, publicName)
    let answer = answers.get(key)
    if (!answer) {
      answer = (async () =>
        (await allowImport(allowImportInfo(v, this.ip.config, publicName))) ===
        true)()
      answers.set(key, answer)
    }
    const allowed = await answer
    if (!v.self) {
      this.served.set(v.module.key, {
        verdict: allowed ? 'real' : 'mock',
        self: null,
      })
    }
    return allowed
  }

  /**
   * The edges that arrive at a module that is its own violation, each
   * classified with the records of its own environment: the connections
   * of `graph` into this environment's module of the file (null: the
   * edges this environment read, the guess of a compile before the graph
   * is complete), and, when the file is client references in an
   * environment whose client references this one renders, the connections
   * into that environment's module of it (its imports there are handoffs:
   * `EdgeViolation.handoff`). Nothing asks which modules import the path
   * in this environment: an exempt importer's import is demand where the
   * bundler resolved it to (SPEC J6.7).
   */
  private incoming(self: EdgeViolation, graph: NodeGraph | null): Incoming {
    const target = self.resolved!
    const out: Incoming = {
      exempt: new Set(),
      allowed: new Set(),
      checked: [],
      unread: new Set(),
    }
    // (an importer merely outside the scope: only of a file outside it too, R89)
    const inside = this.ip.inScope(traceFile(target))
    const sources = this.ip.handoffSources(this.name, target)
    const classify = (from: GraphNode, read: boolean) => {
      const ref = this.ip.ids.parse(from.id)
      if (ref) {
        // an edge module importing it re-exports it: allowed
        if (ref.kind === 'edge') {
          for (const importer of this.ip.liveEnv(ref.env)?.allowedBy(ref.key) ??
            []) {
            out.allowed.add(importer)
          }
        }
        return
      }
      const importer = traceFile(from.id)
      if (
        read &&
        !this.ip.inScope(importer) &&
        (!inside || this.ip.exempt(importer))
      ) {
        out.exempt.add(importer)
      } else if (!this.ip.inScope(importer)) {
        out.unread.add(importer)
      } else {
        // (an import read but not substituted: of a file whose marker only its
        // own compile reads, an SFC)
        out.checked.push({ importer, importerId: from.id, env: from.env })
      }
    }
    const node = { env: this.name, id: self.importerId }
    const known = graph?.importers(node) ?? null
    if (known === null) {
      // (the guess: what this environment read is demand or nothing: a
      // checked import of it is substituted)
      for (const importerId of this.edges.importers(target)) {
        const importer = traceFile(importerId)
        if (!this.ip.inScope(importer)) {
          classify({ env: this.name, id: importerId }, true)
        }
      }
    } else {
      for (const from of known) {
        // (the bundler's module loading a server chunk's client references:
        // plugin-rsc's in `ssr`; the handoff below is the import)
        if (sources.length > 0 && from.id.startsWith('\0')) {
          continue
        }
        if (traceFile(from.id) === self.importer && from.id !== node.id) {
          // (Rsbuild: an SFC's own module imports its compiled script block,
          // the module denied here; the SFC's importers import it)
          for (const sfcImporter of graph!.importers(from) ?? []) {
            classify(sfcImporter, false)
          }
          continue
        }
        classify(
          from,
          this.ip.edgesOf(from.env)?.edge(from.id, target) !== undefined,
        )
      }
    }
    for (const source of sources) {
      const into =
        graph?.importers({ env: source.name, id: target }) ??
        [...source.edges.importers(target)].map((id) => ({
          env: source.name,
          id,
        }))
      for (const from of into) {
        const handoffs = source.handoffsOf(from.id, target)
        if (handoffs.length === 0) {
          classify(from, source.edges.edge(from.id, target) !== undefined)
        }
        // (each import statement is an edge, with its own answer)
        for (const handoff of handoffs) {
          if (source.allowedBy(handoff.module.key).next().done) {
            out.checked.push({
              importer: handoff.importer,
              importerId: from.id,
              env: source.name,
              handoff,
            })
          } else {
            out.allowed.add(handoff.importer)
          }
        }
      }
    }
    return out
  }

  /** Whether the edges arriving at a module that is its own violation make it real (`incoming`), or an allowed import of this type brought it (R96). */
  private demanded(self: EdgeViolation, incoming: Incoming): boolean {
    return (
      incoming.exempt.size > 0 ||
      incoming.allowed.size > 0 ||
      this.ip.targetAllowed(this.type, self.resolved!)
    )
  }

  /** Whether a module that is its own violation has real demand, known without asking, from the edges its compile can read (`incoming` without a graph). */
  private selfAllowed(self: EdgeViolation): boolean {
    return this.demanded(self, this.incoming(self, null))
  }

  /**
   * Development: whether an importer whose plan is stale in its environment
   * explains the presence of a module that is its own violation (a module
   * edited to be marked, built before its unchanged importer): the
   * importer's rebuild reports the import or allows it. The module is then
   * stale too, judged again once the importer is built (it is reported if
   * something else still brings it). The importers are those the guess
   * reads: this environment's, and the handoff's.
   */
  private explainedByStaleImporter(self: EdgeViolation): boolean {
    const stale = this.ip.stale
    if (!stale) {
      return false
    }
    const target = self.resolved!
    for (const env of [this, ...this.ip.handoffSources(this.name, target)]) {
      for (const importerId of env.edges.importers(target)) {
        if (stale.holds(env.name, traceFile(importerId))) {
          stale.add(this.name, traceFile(self.importerId))
          return true
        }
      }
    }
    return false
  }

  /** The denied client-reference imports of `target` by `importerId` recorded here, one per import statement (`EdgeViolation.handoff`). @internal */
  handoffsOf(importerId: string, target: string): Array<EdgeViolation> {
    const out: Array<EdgeViolation> = []
    for (const m of this.modules.values()) {
      if (m.content.resolved !== target) {
        continue
      }
      for (const v of m.violations.values()) {
        if (v.handoff && v.importerId === importerId) {
          out.push(v)
        }
      }
    }
    return out
  }

  /** The importers (files) of an edge module or handoff `allowImport` allowed (by key), while their import is there. @internal */
  *allowedBy(key: string): Generator<string> {
    if (this.served.get(key)?.verdict === 'real') {
      for (const v of this.modules.get(key)?.violations.values() ?? []) {
        yield v.importer
      }
    }
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

  /**
   * Tells `onViolation` about an import that stayed a violation: once with
   * `log: 'once'` and in a build. `trace`: the trace when the caller has it
   * (a build's, read once from its finished graph); otherwise read from the
   * graph when the event's trace is first read.
   */
  private async notify(v: EdgeViolation, trace?: Trace): Promise<void> {
    const { onViolation, log, mode } = this.ip.config
    if (!onViolation) {
      return
    }
    if (mode === 'build' || log === 'once') {
      const notified = this.ip.notifiedOf(this.publicName)
      const key = dedupeKey(v, this.publicName)
      if (notified.has(key)) {
        return
      }
      notified.add(key)
    }
    const returned: unknown = await onViolation(
      violationInfo(
        v,
        this.ip.config,
        trace ?? (() => this.trace(v.importerId)),
        this.publicName,
      ),
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
    if (
      record?.version === RSPACK_BUILD_INFO_VERSION &&
      record.env === this.name
    ) {
      const ref = this.ip.ids.parse(importerId)
      if (ref?.kind === 'edge') {
        if (record.served && !this.served.has(ref.key)) {
          this.served.set(ref.key, {
            verdict: record.served,
            self: null,
            restored: true,
          })
        }
        return
      }
      this.register(importerId, record.violations)
      if (record.clientReferences) {
        this.clientReferences.add(normalizePath(importerId))
      }
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
   * exempt import is gone, a restored edge module (`Served.restored`) or
   * file whose `allowImport` answer (asked once per import, now if not yet) differs. The
   * ids of the modules to build again (an edge module by its id among our
   * modules). Edge modules first: an allowed import brings the module it
   * allows (`allowedImporters`). With the compilation's finished `graph`
   * (Rsbuild's `finishMake`), a denied file's verdict is the edges that
   * arrive at it there (`incoming`), written to the ledger as settled
   * (`Served.settled`: its rebuild serves it); without, the guess.
   */
  async mismatches(graph?: NodeGraph): Promise<Array<string>> {
    const out: Array<string> = []
    for (const [key, entry] of this.served) {
      const m = entry.restored ? this.modules.get(key) : undefined
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
      if (!entry.self) {
        continue
      }
      if (graph) {
        await this.answerHandoffs(entry.self, graph)
      }
      const real = graph
        ? this.demanded(entry.self, this.incoming(entry.self, graph)) ||
          (await this.allows(entry.self))
        : await this.allowsSelf(entry.self)
      if (graph) {
        entry.settled = real
      }
      if (real !== (entry.verdict === 'real')) {
        out.push(id)
      }
    }
    return out
  }

  /**
   * `allowImport`'s answers on the client-reference imports that arrive at
   * a module that is its own violation in `graph` (`incoming`), asked once
   * per import: an importer compiled in this process asked at its compile,
   * a restored one's imports were replayed from its record (`replay`) and
   * are asked here, as a restored edge module's state is (`mismatches`).
   */
  private async answerHandoffs(
    self: EdgeViolation,
    graph: NodeGraph,
  ): Promise<void> {
    const target = self.resolved!
    for (const source of this.ip.handoffSources(this.name, target)) {
      for (const from of graph.importers({ env: source.name, id: target }) ??
        []) {
        for (const handoff of source.handoffsOf(from.id, target)) {
          await source.allows(handoff)
        }
      }
    }
  }

  /**
   * Whether a module restored from the persistent cache with this record must
   * be built again: a record of another version is not restorable (an
   * earlier build wrote the cache; `replay` skips it), and in development a
   * record's violations are this session's to report (another session
   * reported them).
   */
  unjudged(importerId: string, info: unknown): boolean {
    if ((info as { version?: unknown }).version !== RSPACK_BUILD_INFO_VERSION) {
      return true
    }
    const record = info as RspackImportProtectionBuildInfo
    return (
      this.ip.config.mode === 'dev' &&
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
    const clientReferences = clientReferencesOf(out)
    return violations.length > 0 || edges.length > 0 || clientReferences
      ? {
          key: RSPACK_BUILD_INFO_KEY,
          value: {
            version: RSPACK_BUILD_INFO_VERSION,
            env: this.name,
            violations,
            ...(edges.length > 0 && { edges }),
            ...(revision !== null && { revision }),
            ...(served && { served }),
            ...(clientReferences && { clientReferences: true as const }),
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
          value: {
            version: RSPACK_BUILD_INFO_VERSION,
            env: this.name,
            violations: [],
            served,
          },
        }
      : null
  }

  private register(importerId: string, violations: Array<EdgeViolation>): void {
    const keys = new Set<string>()
    for (const v of violations) {
      if (v.env !== this.name) {
        continue
      }
      keys.add(v.module.key)
      this.defineModule(
        v.module.key,
        v.module.content,
        !v.handoff,
      ).violations.set(`${v.importerId}\u0000${v.edgeKey}`, v)
    }
    const previous = this.byImporter.get(importerId)?.keys
    if (!previous) {
      this.importersByFile.add(importerId, traceFile(importerId))
    }
    this.byImporter.set(importerId, { importerId, keys })
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
    const info = violationInfo(
      v,
      this.ip.config,
      () => this.trace(v.importerId),
      this.publicName,
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
      const trace = this.trace(v.importerId)
      await this.notify(denied, trace)
      const info = violationInfo(denied, this.ip.config, trace, this.publicName)
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

  /**
   * An edge module of this environment: registered unless it is known, and
   * emitted (the runtime first) unless it is a handoff's key only (`emit`:
   * `EdgeViolation.handoff`). @internal
   */
  defineModule(
    key: string,
    content: EdgeModuleContent,
    emit = true,
  ): RegisteredModule {
    let m = this.modules.get(key)
    if (!m) {
      m = { content, violations: new Map(), emitted: false }
      this.modules.set(key, m)
    }
    if (emit && !m.emitted) {
      m.emitted = true
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
        this.ip.runtimeLoad(this.name),
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
    for (const id of [...this.clientReferences]) {
      if (!holds(id)) {
        this.clientReferences.delete(id)
      }
    }
    for (const [id, { importerId }] of [...this.byImporter]) {
      if (!holds(importerId)) {
        this.importersByFile.delete(id, traceFile(importerId))
        this.forgetImporter(id)
      }
    }
  }

  /** Forgets a deleted file's importer records (edges, violations of its ids). `allowImport` is asked once per import for the session: its answers stay. */
  forget(path: string): void {
    this.edges.forget(path)
    for (const id of this.importersByFile.take(path)) {
      this.forgetImporter(id)
    }
    for (const id of [...this.clientReferences]) {
      if (traceFile(id) === path) {
        this.clientReferences.delete(id)
      }
    }
  }

  /** Forgets an importer's records (by importer id). */
  private forgetImporter(id: string): void {
    const { importerId, keys } = this.byImporter.get(id)!
    this.byImporter.delete(id)
    this.served.delete(normalizePath(importerId))
    for (const key of keys) {
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
      return unknownEdgeLoad(
        this.name,
        key,
        this.ip.ids,
        this.ip.productionMock,
        this.publicName,
      )
    }
    const runtime = this.ip.ids.specifier({ env: this.name, kind: 'runtime' })
    const c = m.content
    if (this.served.get(key)?.verdict === 'real') {
      return {
        code: allowedModuleCode(c, c.resolved ?? c.specifier),
        moduleSideEffects: null,
      }
    }
    return {
      code: mockModuleCode(c, runtime, this.ip.productionMock, this.publicName),
      moduleSideEffects: null,
    }
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
        const key = served.self.module.key
        const m = this.modules.get(key)
        if (m) {
          return { key, effectful: m.content.effectful }
        }
      }
      return edges(id)
    }
  }

  /**
   * R147: the denied files compiled under their own id whose importers
   * disagree in `graph`: one needs the file as it is (an exempt or
   * unchecked importer, an import `allowImport` allowed), and a checked
   * importer reaches the file itself (a pattern import, an import another
   * plugin added: it cannot get a mock of its own; a denied
   * client-reference import). Read once the graph is complete, so the
   * result does not depend on the order the bundler compiled them in.
   */
  conflicts(graph: NodeGraph): Map<string, Conflict> {
    const out = this.demandedFiles(graph)
    for (const [id, c] of out) {
      if (c.checked.length === 0) {
        out.delete(id)
      }
    }
    return out
  }

  /**
   * The denied files compiled under their own id (`holds`: those the build
   * holds) with real demand and another importer in `graph` that reaches the
   * file itself: checked (R147) or not (`Conflict.unread`).
   */
  private demandedFiles(
    graph: NodeGraph,
    holds?: (id: string) => boolean,
  ): Map<string, Conflict> {
    const out = new Map<string, Conflict>()
    for (const [id, entry] of this.served) {
      const self = entry.self
      if (!self || (holds && !holds(id))) {
        continue
      }
      const incoming = this.incoming(self, graph)
      if (!this.demanded(self, incoming)) {
        continue
      }
      const needers = [...incoming.exempt]
      const allowed = [...incoming.allowed]
      const unread = [...incoming.unread].filter((f) => !incoming.exempt.has(f))
      if (incoming.checked.length > 0 || unread.length > 0) {
        out.set(id, {
          self,
          verdict: entry.verdict,
          needers,
          allowed,
          elsewhere: needers.length === 0 && allowed.length === 0,
          checked: incoming.checked,
          unread,
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
    const info = violationInfo(
      c.self,
      this.ip.config,
      NO_TRACE,
      this.publicName,
    )
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
      this.ip.notifiedOf(this.publicName).clear()
    }
  }

  /**
   * A build output's verdict: the surviving edge modules (`liveKeys`, from
   * `readRolldownWitness`/`readRspackWitness`) tell which violations stayed;
   * `onViolation` hears about each with its trace in `graph`, and the reports
   * are returned, formatted (`error` behaviour: the build fails with them;
   * `mock`: warnings). `holds`: the module ids of the build, from a host that
   * cannot build a module again (a Vite build): a denied file it holds with
   * real demand and an importer the compiler does not read is reported
   * under `behavior` whatever it was served as, when something of it was
   * kept (`rendered`, or its surviving mock), and one a watch rebuild served
   * as it is that no importer needs any more; instead of its other reports
   * (design 4's I3; the Rspack host builds it again before this runs and
   * serves it as it is).
   */
  async surviving(
    liveKeys: ReadonlyArray<string>,
    graph: NodeGraph,
    holds?: (id: string) => boolean,
    /** Vite: whether the output kept any code of a module (a denied file served as it is). */
    rendered?: (id: string) => boolean,
  ): Promise<
    Array<{
      severity: 'error' | 'warning'
      message: string
      info: ViolationInfo
    }>
  > {
    this.graph = graph
    // R147 first: it replaces the file's other reports
    const demanded =
      this.served.size > 0 ? this.demandedFiles(graph, holds) : new Map()
    const conflicts = new Map(
      [...demanded].filter(([, c]) => c.checked.length > 0),
    )
    // a build that cannot build a module again (Vite) serves a denied file
    // with real demand and an unread importer as it compiled it first: the
    // shape is reported whatever was served, so the outcome does not depend
    // on the order; and a watch rebuild that compiled it real while the
    // import that needed it still existed (`stale`)
    const unsettled = new Map<
      string,
      { verdict: 'mock' | 'real'; self: EdgeViolation; order: Conflict | null }
    >()
    if (holds) {
      const survived = new Set(liveKeys)
      for (const [id, c] of demanded) {
        if (
          c.checked.length === 0 &&
          // (nothing of the file the build kept harms no importer)
          (c.verdict === 'mock'
            ? survived.has(c.self.module.key)
            : (rendered?.(id) ?? true))
        ) {
          unsettled.set(id, { verdict: c.verdict, self: c.self, order: c })
        }
      }
      for (const id of await this.mismatches()) {
        const entry = this.served.get(id)
        if (
          entry?.self &&
          entry.verdict === 'real' &&
          holds(id) &&
          !demanded.has(id)
        ) {
          unsettled.set(id, { verdict: 'real', self: entry.self, order: null })
        }
      }
    }
    // the mocked modules that are their own violation whose every importer is not checked (R89), with those importers
    const unchecked = new Map<string, [EdgeViolation, Array<string>]>()
    // those nothing in the graph imports: no supported configuration has one
    // (one entry per environment; a dev server reports the file when it
    // compiles it), so no report accounts for it (design 4, I5)
    const unaccounted: Array<EdgeViolation> = []
    /** The violations to report, each with the environment it is of. */
    const live = new Map<
      string,
      { v: EdgeViolation; owner: ImportProtectionEnv }
    >()
    const add = (v: EdgeViolation, owner: ImportProtectionEnv = this) => {
      const key = dedupeKey(v)
      if (!live.has(key)) {
        live.set(key, { v, owner })
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
          conflicts.has(id)
        ) {
          continue
        }
        // one report per checked import that reaches it: a denied handoff
        // as recorded, an import the compiler does not read by its importer
        const incoming = this.incoming(v, graph)
        for (const c of incoming.checked) {
          const owner = this.ip.liveEnv(c.env) ?? this
          add(c.handoff ?? owner.importOf(v, c), owner)
        }
        const others = new Set([...incoming.exempt, ...incoming.unread])
        if (incoming.checked.length === 0 && others.size > 0) {
          unchecked.set(v.edgeKey, [v, [...others]])
        } else if (incoming.checked.length === 0) {
          unaccounted.push(v)
        }
      }
    }
    const reports = []
    // not violations (no `onViolation`), and errors under both behaviors
    for (const c of conflicts.values()) {
      reports.push(this.formatConflict(c))
    }
    for (const key of [...live.keys()].sort()) {
      const { v, owner } = live.get(key)!
      // (read once: an event kept after the build holds no reader of it)
      const trace = owner.trace(v.importerId, graph)
      await owner.notify(v, trace)
      const info = violationInfo(v, this.ip.config, trace, owner.publicName)
      reports.push({
        severity:
          v.behavior === 'error' ? ('error' as const) : ('warning' as const),
        message: formatViolation(v, info, this.ip.report),
        info: info as ViolationInfo,
      })
    }
    // not violations (no `onViolation`, no failure): a warning per module
    for (const [v, importers] of unchecked.values()) {
      const info = violationInfo(v, this.ip.config, NO_TRACE, this.publicName)
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
        info: violationInfo(
          v,
          this.ip.config,
          NO_TRACE,
          this.publicName,
        ) as ViolationInfo,
      })
    }
    // not violations either, but the build shipped what no importer asked for
    for (const { verdict, self: v, order } of unsettled.values()) {
      const info = violationInfo(v, this.ip.config, NO_TRACE, this.publicName)
      const others = order ? order.unread : [...this.incoming(v, graph).unread]
      reports.push({
        severity:
          v.behavior === 'error' ? ('error' as const) : ('warning' as const),
        message: formatServedMismatch(
          info,
          verdict,
          order ? order.needers : 'stale',
          others,
          this.ip.report,
        ),
        info: info as ViolationInfo,
      })
    }
    return reports
  }

  /**
   * Build: the violation a module's own violation stands for at a checked
   * importer of this environment whose import the compiler does not read
   * (`incoming`), found by the pattern import in its text.
   */
  private importOf(self: EdgeViolation, c: CheckedEdge): EdgeViolation {
    const { self: _self, ...violation } = self
    return {
      ...violation,
      env: this.name,
      envType: this.type,
      edgeKey: `${self.edgeKey}\u0000${c.importerId}`,
      importer: c.importer,
      importerId: c.importerId,
      ...this.patternImportOf(c.importer, self.resolved!),
    }
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
