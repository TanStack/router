/**
 * The import-protection facade a Start host owns for one session (a dev
 * server or a build): the resolved config, the `import-edges` planner, one
 * `ImportProtectionEnv` per Start environment (edge modules, the
 * `allowImport` decision, dev and build reports, traces), and the edge modules' code. Host-agnostic: the
 * Vite and Rspack hosts call it from their hooks.
 */
import path from 'node:path'
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
  groundedGraph,
  nodeKey,
  readSourceFile,
  traceFile,
  traceOf,
} from './graph-trace'
import { Locator } from './locate'
import {
  findPatternImport,
  literalNaming,
  stringLiterals,
} from './pattern-imports'
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
  judgedEdgesOf,
  selfViolationOf,
  violationInfo,
  violationsOf,
} from './violations'
import { mockLookup } from './chunk-lists'
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
import type {
  GraphNode,
  GroundedGraph,
  NodeGraph,
  SourceReader,
  Trace,
} from './graph-trace'
import type { DevReport, DevReporterOptions, ReportSink } from './report'
import type { EnvType } from './rules'
import type {
  EdgeViolation,
  RspackImportProtectionBuildInfo,
} from './violations'
import type { MockLookup } from './chunk-lists'
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
  /**
   * Whether the host settles a denied file's verdict from the compilation's
   * finished graph before it serves the compilation (Rsbuild's
   * `finishMake`): in development a module's own verdict is reported once
   * it is final (`ImportProtectionEnv.reportSettled`), not at its compile,
   * whose verdict is a guess. Default: the compile's verdict is final.
   */
  settles?: boolean
}

/** The code of one of our modules, for a host's `load` (or virtual file). */
interface EdgeModuleLoad {
  code: string
  /** Vite `moduleSideEffects`: false for the runtime, true for an evaluated mock (`EdgeModuleContent.evaluated`), else analysed (null). */
  moduleSideEffects: boolean | null
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
  })
  return config
    ? new ImportProtection(
        config,
        opts.ids ?? viteEdgeModuleIds,
        opts.isEntry ?? (() => false),
        opts.readSource,
        opts.framework,
        opts.rsc ?? false,
        opts.settles ?? false,
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
    /** Whether a path is an app entry (`CreateImportProtectionOptions.isEntry`). */
    readonly isEntry: (path: string) => boolean,
    /** Raw source text for trace positions (`CreateImportProtectionOptions.readSource`). */
    readonly readSource: SourceReader = readSourceFile,
    readonly framework: CompileStartFrameworkOptions = 'react',
    rsc = false,
    /** Whether the host settles verdicts (`CreateImportProtectionOptions.settles`). */
    readonly settles = false,
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

  /**
   * The verdicts of the denied modules (compiled under their own id) of the
   * compile environments `envs` in a compilation's `graph`, as a fresh
   * build of the same source gives them (design-rsc-phase1-settlement.md
   * §2.2, SPEC J6.7): a denied module is real exactly when an exempt or
   * allowed import arrives at it from a module the app reaches without a
   * denied module that is not real (`groundedGraph`), or, reached so
   * itself, when an allowed import of an environment of its type brought
   * it (R96) or `allowImport` allows the file (asked only of the modules
   * still mock once no import makes another real). The least solution:
   * every module starts mock, and the ones the rule makes real are added
   * until none is, so a module is never real only because of itself (a
   * cycle with its exempt barrel). Only the modules `decides` holds (the
   * compilation's own) are decided; any other (another compilation's: a
   * finished child's) keeps what its compile served.
   */
  async ground(
    envs: Iterable<ImportProtectionEnv>,
    graph: NodeGraph,
    decides: (node: GraphNode) => boolean,
  ): Promise<Grounding> {
    interface Denied {
      env: ImportProtectionEnv
      self: EdgeViolation
      node: GraphNode
      key: string
    }
    const denied = new Set<string>()
    /** The real ones, by key: what makes each real. */
    const real = new Map<string, string>()
    const open: Array<Denied> = []
    for (const env of envs) {
      for (const { self, verdict } of env.deniedModules()) {
        const node = { env: env.name, id: self.importerId }
        const key = nodeKey(node)
        denied.add(key)
        if (decides(node)) {
          open.push({ env, self, node, key })
        } else if (verdict === 'real') {
          real.set(key, 'its compile served it as it is')
        }
      }
    }
    // (the client-reference imports of restored importers, before a verdict reads them)
    for (const d of open) {
      await d.env.answerHandoffs(d.self, graph)
    }
    const view = () => {
      const realNow = new Set(real.keys())
      return groundedGraph(
        graph,
        (n) => {
          const key = nodeKey(n)
          return denied.has(key) && !realNow.has(key)
        },
        (n, g) => this.handoffImporters(n, g),
      )
    }
    for (;;) {
      const grounded = view()
      let added = false
      for (const d of open) {
        const why = real.has(d.key) ? null : d.env.grantOf(d.self, grounded)
        if (why) {
          real.set(d.key, why)
          added = true
        }
      }
      if (added) {
        continue
      }
      for (const d of open) {
        const why =
          real.has(d.key) || !grounded.supported(d.node)
            ? null
            : await d.env.ownGrant(d.self, grounded)
        if (why) {
          real.set(d.key, why)
          added = true
        }
      }
      if (!added) {
        break
      }
    }
    const decided = new Set(open.map((d) => d.key))
    return {
      verdictOf(node) {
        const key = nodeKey(node)
        if (!decided.has(key)) {
          return null
        }
        const why = real.get(key)
        return why
          ? { real: true, why }
          : { real: false, why: 'no allowed import arrives at it' }
      },
    }
  }

  /**
   * `graph` as the ledgers' verdicts make it (`groundedGraph`: what a denied
   * module served as its mock imported is in no fresh build), for what reads
   * the edges arriving at a module once the settlement ran (R147, reports,
   * traces); `graph` itself when no module is served as its mock.
   */
  servedGraph(graph: NodeGraph): NodeGraph {
    if (![...this.envs.values()].some((env) => env.servesAnyMock())) {
      return graph
    }
    return groundedGraph(
      graph,
      (n) => this.envs.get(n.env)?.servesMock(n.id) === true,
      (n, g) => this.handoffImporters(n, g),
    )
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

  /**
   * Whether an allowed import brought `resolved` into environments of this
   * type (R96): a released environment's, or a live one's whose importer
   * `counts` (default: every one; the settlement's verdicts count an
   * importer in its compilation's graph only when the importer is in a
   * fresh build, `groundedGraph`, so a denied module a cycle allows does
   * not stay real by itself). @internal
   */
  targetAllowed(
    type: EnvType,
    resolved: string,
    counts: (importer: GraphNode) => boolean = () => true,
  ): boolean {
    if (this.releasedTargets[type].has(resolved)) {
      return true
    }
    for (const env of this.envs.values()) {
      if (env.type === type) {
        for (const importer of env.allowedImporters(resolved)) {
          if (counts(importer)) {
            return true
          }
        }
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
 * The verdict on a denied file compiled under its own id, as the
 * environment handed it to the bundler (the served ledger, written by the
 * commit of the file's answer): `self`, its own violation; `real`, an
 * unchecked importer imports it, or an allowed import brought it. An edge
 * module's state is its definition's (`EdgeState`). Every reader (the chunk-list
 * reader, the build report) reads it; none decides again.
 */
interface Served {
  verdict: 'mock' | 'real'
  self: EdgeViolation
  /**
   * A denied file's verdict as the settlement gives it from the
   * compilation's graph (`ImportProtection.ground`, `settle`: Rsbuild's
   * `finishMake`), which its next compiles serve until the next settlement
   * (a prediction: each settlement decides again): the edges a compile
   * reads in its own environment can disagree with the graph (an exempt
   * importer whose import a user's rule moved to another layer's module).
   */
  settled?: boolean
}

/**
 * A checked importer whose import reaches a denied file compiled under its
 * own id (`Incoming.checked`): an import the compiler does not read (a
 * pattern import, an import another plugin added), or a denied
 * client-reference import (`handoff`: its violation).
 */
/**
 * An edge's state (`ImportProtectionEnv.edgeStates`, by its key): owned by
 * the edge's definition, not by an importer (`defineEdges`, `decide`).
 * `real`: `allowImport` allowed its import, the edge module re-exports the
 * target.
 */
interface EdgeState {
  verdict: 'mock' | 'real'
  /**
   * Read from a restored module's record (Rspack's persistent cache:
   * another session's answer), until this session's `allowImport` answer
   * replaces it (`restoredMismatches`). Any other state was written from
   * this session's answer on the edge's one import (`dedupeKey`), asked once
   * and remembered: it never differs.
   */
  restored?: true
}

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

/** The settlement's verdicts of a compilation (`ImportProtection.ground`). */
export interface Grounding {
  /** A denied module's verdict and what makes it so, when the settlement decides it (a module of the compilation itself); null otherwise. */
  verdictOf: (node: GraphNode) => { real: boolean; why: string } | null
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
  /**
   * Dev `behavior: 'error'`: the violations of answers that defer it to the
   * bundler's request (`EdgeViolation.pending`), every answer's, by
   * `${importerId}\0${edgeKey}`. A request of the edge by an answer no
   * commit recorded (overtaken) fails its caller with the error, reported
   * nowhere else (`confirm`). An entry is per edge, not per answer: every
   * overtaken caller that names the edge fails, whenever it requests it.
   * It lives until its importer's file is removed (`forget`) or a watch
   * build no longer holds the importer (`hold`); no request and no other
   * answer's commit or retirement releases it. Its memory is bounded by
   * those two (dev: an entry per deferred edge of a file still there).
   */
  deferred?: Map<string, EdgeViolation>
}

/** A compile output, as `compileModule` returns it (structural). */
export interface CompiledOutputLike {
  output: string
  facts: { planners: Record<string, unknown> }
}

/**
 * An importer's record of one answer (`ImportProtectionEnv.judge`), which
 * `commit` writes for a current answer: plain data.
 */
export interface IpRecord {
  /** The output's violations (every environment's: a handoff's are another's). */
  violations: Array<EdgeViolation>
  clientReferences: boolean
  /** The output is the env module (its client references are decided by it). */
  envOutput: boolean
  /** The edges its plan judged; null: none (the planner did not run). */
  edges: ReturnType<typeof judgedEdgesOf>
  /** The verdict on a module that is its own violation; null: it is none. */
  self: Served | null
  /** Dev: the module's file, stale in this environment until an importer whose plan is stale is built (`staleImporterExplains`); null: none. */
  stale: string | null
}

/** An edge module a judgement's code names (`defineEdges`), with `allowImport`'s decision on it (null: undecided, the mock). */
export interface EdgeDefinition {
  key: string
  content: EdgeModuleContent
  /** Its code is handed to the listeners (a handoff's key has none: `EdgeViolation.handoff`). */
  emit: boolean
  verdict: 'mock' | 'real' | null
  /** Dev `behavior: 'error'`: the violation the bundler's request of the edge decides (`RegisteredModule.deferred`); null: none. */
  deferred: EdgeViolation | null
}

/** One answer judged by import protection (`ImportProtectionEnv.judge`). */
export interface Judgement {
  record: IpRecord
  edgeModules: Array<EdgeDefinition>
  /** The mock to serve instead of the output (its own violation). */
  mock?: { code: string; id: string }
  /** Fails the module, current or not (dev `behavior: 'error'`). */
  error: Error | null
  /**
   * What a commit tells (`onViolation`, the dev reporter), in order; each
   * asks `current()` again after it waited (a callback can outlast its
   * answer: a newer one overtook it).
   */
  reports: Array<Report>
}

/** One report of a commit (`Judgement.reports`). */
export type Report = (current: () => boolean) => Promise<void>

/** Runs a commit's reports in order, each while its answer is current. */
export async function runReports(
  reports: ReadonlyArray<Report>,
  current: () => boolean = () => true,
): Promise<void> {
  for (const report of reports) {
    if (!current()) {
      return
    }
    await report(current)
  }
}

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
  /** The bundler's graph (dev: the dev server's module graphs; build: the compilation's, set per pass by `surviving`). */
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
  /** The edge keys holding a deferred violation (`RegisteredModule.deferred`), by its importer's file: what `forget` and `hold` release. */
  private readonly deferredByFile = new Map<string, Set<string>>()
  /** The served ledger (`Served`): a denied file compiled under its own id, by that id (`normalizePath`). */
  private readonly served = new Map<string, Served>()
  /**
   * The edges' states (`EdgeState`), by edge key: what their definitions
   * hold (a restored edge's state may come before its definition).
   */
  private readonly edgeStates = new Map<string, EdgeState>()
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
        // (a denied handoff is reported with the module it brings, and a
        // module's own violation by `reportSettled`)
        v.handoff ||
        v.self ||
        (await this.decide(v))
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
   * to judge (`judge`, through `StartCompilerSession.transform`). Null when nothing can deny it here. On a
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
    if (this.type !== 'client' || id.startsWith('\0')) {
      return null
    }
    // (a dependency's file name is judged when the scope reaches it; its
    // marker, wherever it is)
    const rule = await fileOrMarkerRule(
      config,
      this.type,
      path,
      async (id) => {
        if (identify(id).lang === null) {
          return null
        }
        const m = await marker(id)
        return m === 'conflict' ? 'server-only' : m
      },
      {
        markerFirst: true,
        files:
          !NODE_MODULES_RE.test(path) ||
          this.ip.inScope(path) ||
          this.ip.exempt(path),
      },
    )
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
   * Judges a compile of an id of this environment (fresh or cached) and
   * writes nothing an importer owns (`commit` does, for a current answer
   * only): the importer's record (its violations, judged edges, client
   * references, the verdict on a module that is its own violation), its
   * edge modules with `allowImport`'s decision on each (`defineEdges`
   * defines them for every answer: its code names them), the mock a module
   * that is its own violation is served as unless it has real demand
   * (`allowsSelf`), in dev the error of `behavior: 'error'` violations
   * `allowImport` does not allow (the module must not be served, current or
   * not), and the reports a commit runs (`onViolation`, the dev reporter).
   * A build reports a served mock on survival (`surviving`), a dev compile
   * now, as its only violation (its imports reach nothing). A promise only
   * when something is asked now (`allowImport`; a module's own violation).
   */
  judge(
    importerId: string,
    out: CompiledOutputLike,
  ): Judgement | Promise<Judgement> {
    const violations = violationsOf(out)
    const judged = judgedEdgesOf(out)
    const record: IpRecord = {
      violations,
      clientReferences: clientReferencesOf(out),
      envOutput: out.output === 'env',
      // the edges its plan judged, a cached plan's as a fresh one's; none
      // (the planner did not run: the module imports nothing now): what it
      // imported before is no edge any more, nor a real demand it made
      edges: judged,
      self: null,
      stale: null,
    }
    const defers =
      this.ip.config.mode === 'dev' && this.ip.config.behavior === 'error'
    const edgeModules: Array<EdgeDefinition> = []
    for (const v of violations) {
      if (v.env === this.name) {
        edgeModules.push({
          key: v.module.key,
          content: v.module.content,
          emit: !v.handoff,
          verdict: null,
          deferred: defers && v.pending && v.behavior === 'error' ? v : null,
        })
      }
    }
    const judgement: Judgement = {
      record,
      edgeModules,
      error: null,
      reports: [],
    }
    const self = violations.find((v) => v.self && v.env === this.name)
    if (!self) {
      return violations.length > 0
        ? this.judgeImports(judgement, violations)
        : judgement
    }
    return this.judgeSelf(judgement, self)
  }

  /** `judge` of a module that is its own violation: served real or as its mock. */
  private async judgeSelf(
    judgement: Judgement,
    self: EdgeViolation,
  ): Promise<Judgement> {
    const id = normalizePath(self.importerId)
    // (the graph's verdict of the last settlement, else the guess)
    const settled = this.served.get(id)?.settled
    const real = settled ?? (await this.allowsSelf(self))
    judgement.record.self = {
      verdict: real ? 'real' : 'mock',
      self,
      ...(settled !== undefined && { settled }),
    }
    if (real) {
      return this.judgeImports(
        judgement,
        judgement.record.violations.filter((v) => v !== self),
      )
    }
    judgement.mock = this.mockOf(self)
    if (this.ip.config.mode !== 'dev') {
      return judgement
    }
    const stale = this.staleImporterExplains(self)
    if (stale) {
      judgement.record.stale = stale
      return judgement
    }
    const errors: Array<DevReport> = []
    for (const { v, owner } of this.devReportsOf(self, null)) {
      if (v.behavior === 'error') {
        errors.push(owner.devReport(v))
      }
      // (a host that settles: the verdict is a guess, reported once final,
      // `reportSettled`; the module's failure is its compile's, and a
      // settlement that serves it otherwise builds it again)
      if (!this.ip.settles) {
        judgement.reports.push(async (current) => {
          await owner.notify(v)
          if (current()) {
            owner.report(v)
          }
        })
      }
    }
    judgement.error = this.errorOf(errors)
    return judgement
  }

  /**
   * `judge` of a compile's imports: `allowImport`'s answer on each, asked at
   * the compile (a denied file compiled before the bundler resolves the
   * import then finds it allowed) and carried by its edge module's
   * definition; in dev, the violations it does not allow are reported.
   */
  private judgeImports(
    judgement: Judgement,
    violations: Array<EdgeViolation>,
  ): Judgement | Promise<Judgement> {
    const dev = this.ip.config.mode === 'dev'
    if (!dev && !this.ip.config.allowImport) {
      return judgement
    }
    return (async () => {
      const errors: Array<DevReport> = []
      for (const v of violations) {
        if (v.env !== this.name || v.pending) {
          continue
        }
        const allowed = await this.allows(v)
        // (no `allowImport`: no decision, the edge stays undecided)
        if (!v.self && this.ip.config.allowImport) {
          for (const e of judgement.edgeModules) {
            if (e.key === v.module.key) {
              e.verdict = allowed ? 'real' : 'mock'
            }
          }
        }
        // (a denied handoff is reported when the module it brings compiles
        // as its mock: `devReportsOf`)
        if (dev && !allowed && !v.handoff) {
          if (v.behavior === 'error') {
            errors.push(this.devReport(v))
          }
          judgement.reports.push(async (current) => {
            await this.notify(v)
            if (current()) {
              this.report(v)
            }
          })
        }
      }
      judgement.error ??= this.errorOf(errors)
      return judgement
    })()
  }

  /**
   * Defines a judgement's edge modules (`judge`), for every answer, current
   * or not: the answer's code names them, and the bundler loads what its
   * caller's code names. Content-addressed and idempotent (Rspack: their
   * virtual files are written through `onEdgeModule` before the importer's
   * dependencies resolve); `allowImport`'s decision on an edge is the
   * memo's answer, the same for every answer that asks it.
   */
  defineEdges(edgeModules: ReadonlyArray<EdgeDefinition>): void {
    for (const e of edgeModules) {
      const m = this.defineModule(e.key, e.content, e.emit)
      if (e.verdict) {
        this.edgeStates.set(e.key, { verdict: e.verdict })
      }
      if (e.deferred) {
        ;(m.deferred ??= new Map()).set(
          `${e.deferred.importerId}\u0000${e.deferred.edgeKey}`,
          e.deferred,
        )
        const file = traceFile(e.deferred.importerId)
        let keys = this.deferredByFile.get(file)
        if (!keys) {
          keys = new Set()
          this.deferredByFile.set(file, keys)
        }
        keys.add(e.key)
      }
    }
  }

  /**
   * Writes a current answer's importer record (`judge`): its violations
   * (and releases the edges of its previous record it no longer has), its
   * judged edges (the index's one writer), its client references, and the
   * verdict on a module that is its own violation.
   */
  commit(importerId: string, record: IpRecord): void {
    this.register(importerId, record.violations)
    if (record.clientReferences) {
      this.clientReferences.add(normalizePath(importerId))
    } else if (this.clientReferences.size > 0 && record.envOutput) {
      this.clientReferences.delete(normalizePath(importerId))
    }
    if (record.edges) {
      this.edges.set(importerId, record.edges.edges, record.edges.revision)
    } else {
      this.edges.delete(importerId)
    }
    if (record.self) {
      this.served.set(normalizePath(importerId), record.self)
    } else if (this.served.size > 0) {
      this.served.delete(normalizePath(importerId))
    }
    if (record.stale) {
      this.ip.stale?.add(this.name, record.stale)
    }
  }

  /**
   * Retires an id's importer record: a current answer that compiled nothing
   * of it (untouched, or no longer admitted) holds no import. A failed answer
   * keeps the record (a compile error) or commits its judged one (an
   * import-protection error).
   */
  retire(importerId: string): void {
    if (this.byImporter.has(importerId)) {
      this.importersByFile.delete(importerId, traceFile(importerId))
      this.forgetImporter(importerId)
    }
    this.edges.delete(importerId)
    if (this.clientReferences.size > 0) {
      this.clientReferences.delete(normalizePath(importerId))
    }
    if (this.served.size > 0) {
      this.served.delete(normalizePath(importerId))
    }
  }

  /**
   * Dev: what a module that is its own violation, served its mock, is
   * reported as: the denied client-reference imports that bring it (each
   * of its own environment, at its position; in `graph`, else those its
   * environments read), else itself.
   */
  private devReportsOf(
    self: EdgeViolation,
    graph: NodeGraph | null,
  ): Array<{ v: EdgeViolation; owner: ImportProtectionEnv }> {
    const out: Array<{ v: EdgeViolation; owner: ImportProtectionEnv }> = []
    for (const c of this.incoming(self, graph).checked) {
      const owner = c.handoff && this.ip.liveEnv(c.env)
      if (owner) {
        out.push({ v: c.handoff!, owner })
      }
    }
    return out.length > 0 ? out : [{ v: self, owner: this }]
  }

  /** The mock a module that is its own violation is served as, rendered from the judged violation (no registered edge read). */
  private mockOf(self: EdgeViolation): { code: string; id: string } {
    const key = self.module.key
    return {
      code: mockModuleCode(
        self.module.content,
        this.ip.ids.specifier({ env: this.name, kind: 'runtime' }),
        this.ip.productionMock,
        this.publicName,
      ),
      id: this.ip.ids.specifier({ env: this.name, kind: 'edge', key }),
    }
  }

  /**
   * `allowImport`'s answer on an import: the one owner of the decision, asked
   * once per import (`dedupeKey`) before anything depends on it; it writes
   * nothing (a judgement's answer can be overtaken). The answer is the
   * state of its edge module (`served`, written by its definition:
   * `defineEdges`, `decide`), which brings the module into environments of
   * this type while the import is there (`allowedImporters`); `false` or
   * nothing is the normal outcome under `behavior`.
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
    return answer
  }

  /**
   * `allows`, its answer written as the state of the import's edge module
   * or handoff (outside a judgement: an edge module about to load,
   * `confirm`; a restored record, `restoredMismatches`, `reportAgain`; the
   * handoffs a settlement answers, `answerHandoffs`).
   */
  private async decide(v: EdgeViolation): Promise<boolean> {
    const allowed = await this.allows(v)
    // (no `allowImport`: no decision, the edge stays undecided)
    if (!v.self && this.ip.config.allowImport) {
      this.edgeStates.set(v.module.key, { verdict: allowed ? 'real' : 'mock' })
    }
    return allowed
  }

  /**
   * Whether anything imports the module that is its own violation `self`
   * in the bundler's `graph` (`NodeGraph.built`: an importer outside the
   * app included, one a file-less module holds or the file-less module
   * itself: a provide-shared module's, a container's, whose mock nothing
   * reports, as in dev), else, where the graph cannot read the
   * environment, in its records. Not the records where the graph reads it:
   * they keep an import the bundler dropped.
   */
  private imported(self: EdgeViolation, graph: NodeGraph): boolean {
    const node = { env: this.name, id: self.importerId }
    if (graph.imported) {
      return graph.imported(node)
    }
    for (const _ of graph.importers(node) ??
      this.edges.importers(self.resolved!)) {
      return true
    }
    return false
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
    // a marker denies the file to every importer the user does not exempt,
    // whether the compiler reads it or not (a package's barrel)
    const byMarker = self.rule.type === 'marker'
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
      if (byMarker) {
        if (this.ip.exempt(importer)) {
          out.exempt.add(importer)
        } else {
          out.checked.push({ importer, importerId: from.id, env: from.env })
        }
      } else if (
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
        // (each import of the file, its own edge with its own answer:
        // `dedupeKey`, one per specifier)
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
   * reads: this environment's, and the handoff's. Gives the module's file,
   * which the commit makes stale (`IpRecord.stale`), or null.
   */
  private staleImporterExplains(self: EdgeViolation): string | null {
    const stale = this.ip.stale
    if (!stale) {
      return null
    }
    const target = self.resolved!
    for (const env of [this, ...this.ip.handoffSources(this.name, target)]) {
      for (const importerId of env.edges.importers(target)) {
        if (stale.holds(env.name, traceFile(importerId))) {
          return traceFile(self.importerId)
        }
      }
    }
    return null
  }

  /** The denied client-reference imports of `target` by `importerId` recorded here, one per import (a specifier: `EdgeViolation.handoff`). @internal */
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
    if (this.edgeStates.get(key)?.verdict === 'real') {
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
   * The importers (their modules) of this environment whose import of
   * `resolved` `allowImport` allowed and is still there (its edge module
   * served real, with a violation of the importer registered).
   */
  *allowedImporters(resolved: string): Generator<GraphNode> {
    for (const [key, entry] of this.edgeStates) {
      const m = entry.verdict === 'real' ? this.modules.get(key) : undefined
      if (m?.content.resolved === resolved) {
        for (const v of m.violations.values()) {
          yield { env: this.name, id: v.importerId }
        }
      }
    }
  }

  /** The modules the allowed imports still there bring (`allowedImporters`), for `ImportProtection.release`. */
  *allowedTargets(): Generator<string> {
    for (const [key, entry] of this.edgeStates) {
      const m = entry.verdict === 'real' ? this.modules.get(key) : undefined
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
        if (record.served && !this.edgeStates.has(ref.key)) {
          this.edgeStates.set(ref.key, {
            verdict: record.served,
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
    return this.served.size > 0 || this.edgeStates.size > 0
  }

  /**
   * The restored edge modules (`Served.restored`: Rspack's persistent cache)
   * whose `allowImport` answer (asked once per import, now if not yet)
   * differs from the state their record says was served: the ids to build
   * again (by their id among our modules), the state their rebuild loads
   * written. An edge module's state brings the module it allows
   * (`allowedImporters`): read before any denied module's verdict.
   */
  async restoredMismatches(): Promise<Array<string>> {
    const out: Array<string> = []
    for (const [key, entry] of this.edgeStates) {
      const m = entry.restored ? this.modules.get(key) : undefined
      if (!m) {
        continue
      }
      const [first] = m.violations.values()
      const real = await this.decide(
        first ?? this.violationOfContent(key, m.content),
      )
      if (real !== (entry.verdict === 'real')) {
        // (the state its rebuild loads)
        this.edgeStates.set(key, { verdict: real ? 'real' : 'mock' })
        out.push(this.ip.ids.specifier({ env: this.name, kind: 'edge', key }))
      }
    }
    return out
  }

  /**
   * What the ledger says was served and what the importers this
   * environment read now ask for disagree (design 4, I3), on a host with no
   * graph settlement (Vite): a restored edge module (`restoredMismatches`),
   * a denied file served the mock whose exempt importer was compiled after
   * it, one served real whose exempt import is gone, or whose `allowImport`
   * answer differs. The ids of the modules to build again.
   */
  async mismatches(): Promise<Array<string>> {
    const out = await this.restoredMismatches()
    for (const [id, entry] of this.served) {
      if ((await this.allowsSelf(entry.self)) !== (entry.verdict === 'real')) {
        out.push(id)
      }
    }
    return out
  }

  /**
   * The settlement's verdicts (`ImportProtection.ground`) of the denied
   * modules a compilation decides, written to the ledger as settled
   * (`Served.settled`: their next compiles serve them); the ids of those its
   * own module was built otherwise (`served`: the module's record, else the
   * ledger's; another compilation's module of the file, a child's or the
   * parent's, writes the ledger too), to build again. A module it does not
   * decide (another compilation's) keeps what its compile served.
   */
  settle(
    grounding: Grounding,
    served: (node: GraphNode) => 'mock' | 'real' | null,
  ): Array<{
    id: string
    verdict: { real: boolean; why: string }
  }> {
    const out: Array<{ id: string; verdict: { real: boolean; why: string } }> =
      []
    for (const [id, entry] of this.served) {
      const node = { env: this.name, id: entry.self.importerId }
      const verdict = grounding.verdictOf(node)
      if (!verdict) {
        continue
      }
      entry.settled = verdict.real
      if (verdict.real !== ((served(node) ?? entry.verdict) === 'real')) {
        out.push({ id, verdict })
      }
    }
    return out
  }

  /** The ledger's denied modules compiled under their own id, as served. @internal */
  *deniedModules(): Generator<{
    self: EdgeViolation
    verdict: 'mock' | 'real'
  }> {
    for (const { self, verdict } of this.served.values()) {
      yield { self, verdict }
    }
  }

  /** Whether the ledger serves any module as the mock of its own violation. @internal */
  servesAnyMock(): boolean {
    for (const { verdict } of this.served.values()) {
      if (verdict === 'mock') {
        return true
      }
    }
    return false
  }

  /** Whether the ledger serves module `id` as the mock of its own violation. @internal */
  servesMock(id: string): boolean {
    const entry = this.served.get(normalizePath(id))
    return entry?.verdict === 'mock'
  }

  /** What makes a denied module real in `graph` (an exempt or allowed import arriving at it: `incoming`), as the settlement's history names it; null: nothing. @internal */
  grantOf(self: EdgeViolation, graph: NodeGraph): string | null {
    const incoming = this.incoming(self, graph)
    const { root } = this.ip.config
    for (const exempt of incoming.exempt) {
      return `${relativizePath(exempt, root)} imports it, and is not checked`
    }
    for (const allowed of incoming.allowed) {
      return `allowImport allows the import of it in ${relativizePath(allowed, root)}`
    }
    return null
  }

  /**
   * What makes a denied module itself real, as the settlement's history
   * names it: an allowed import of an environment of its type (R96) whose
   * importer is in `graph` as a fresh build has it (a released
   * environment's: any), or `allowImport` on the file; null: nothing.
   * @internal
   */
  async ownGrant(
    self: EdgeViolation,
    graph: GroundedGraph,
  ): Promise<string | null> {
    if (this.ip.targetAllowed(this.type, self.resolved!, graph.counts)) {
      return `an allowed import of another ${this.type} environment brings it`
    }
    return (await this.allows(self)) ? 'allowImport allows the file' : null
  }

  /**
   * `allowImport`'s answers on the client-reference imports that arrive at
   * a module that is its own violation in `graph` (`incoming`), asked once
   * per import: an importer compiled in this process asked at its compile,
   * a restored one's imports were replayed from its record (`replay`) and
   * are asked here, as a restored edge module's state is
   * (`restoredMismatches`). @internal
   */
  async answerHandoffs(self: EdgeViolation, graph: NodeGraph): Promise<void> {
    const target = self.resolved!
    for (const source of this.ip.handoffSources(this.name, target)) {
      for (const from of graph.importers({ env: source.name, id: target }) ??
        []) {
        for (const handoff of source.handoffsOf(from.id, target)) {
          await source.decide(handoff)
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

  /**
   * What the Rspack loader stores in an importer's `buildInfo`: its judged
   * record (`IpRecord`: the violations, judged edges, client references,
   * and the verdict it was served in), plain data a restore replays
   * (`replay`). Null when there is nothing to keep.
   */
  buildInfoOf(record: IpRecord): {
    key: string
    value: RspackImportProtectionBuildInfo
  } | null {
    const edges = record.edges?.edges ?? []
    const revision = record.edges?.revision ?? null
    const served = record.self?.verdict
    return record.violations.length > 0 ||
      edges.length > 0 ||
      record.clientReferences
      ? {
          key: RSPACK_BUILD_INFO_KEY,
          value: {
            version: RSPACK_BUILD_INFO_VERSION,
            env: this.name,
            violations: record.violations,
            ...(edges.length > 0 && { edges }),
            ...(revision !== null && { revision }),
            ...(served && { served }),
            ...(record.clientReferences && { clientReferences: true as const }),
          },
        }
      : null
  }

  /** What the Rspack loader stores in an edge module's `buildInfo`: the state it was served in (null: never decided, the mock). */
  edgeBuildInfo(
    id: string,
  ): { key: string; value: RspackImportProtectionBuildInfo } | null {
    const ref = this.ip.ids.parse(id)
    const served = ref?.kind === 'edge' && this.edgeStates.get(ref.key)?.verdict
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
    const report = this.devReport(v)
    if (v.behavior === 'error') {
      return [report]
    }
    this.reporter?.enqueue(report)
    return []
  }

  /** Dev: the report of a violation (its trace read from the graph when first read). */
  private devReport(v: EdgeViolation): DevReport {
    return {
      violation: v,
      info: violationInfo(
        v,
        this.ip.config,
        () => this.trace(v.importerId),
        this.publicName,
      ),
    }
  }

  /**
   * Development, on a host that settles (`ImportProtection.settles`:
   * Rsbuild's `finishModules`, after the settlement at `finishMake`): the
   * modules that are their own violation the compilation's graph (`graph`)
   * reaches, served as their mock, reported now that their verdict is final
   * for the module the host serves (`devReportsOf`), as a compile reports
   * them on a host whose compile is final. `log` says how often: `'once'`
   * drops what was reported (`notify`, the reporter), `'always'` reports
   * them in every compilation bundling them.
   */
  async reportSettled(): Promise<void> {
    const { graph } = this
    if (this.ip.config.mode !== 'dev' || !graph) {
      return
    }
    for (const entry of this.served.values()) {
      const self = entry.self
      if (entry.verdict !== 'mock' || !this.reachable(self.importerId)) {
        continue
      }
      for (const { v, owner } of this.devReportsOf(self, graph)) {
        await owner.notify(v)
        owner.report(v)
      }
    }
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
    return ref?.kind === 'edge' &&
      this.edgeStates.get(ref.key)?.verdict === 'real'
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
    // an answer no commit recorded (overtaken) still fails its own caller,
    // which requests the edge its code names; nothing reports it
    const overtaken: Array<EdgeViolation> = []
    for (const [key, v] of m.deferred ?? []) {
      if (!m.violations.has(key)) {
        overtaken.push(v)
      }
    }
    if (
      pending.length === 0 &&
      overtaken.length === 0 &&
      !this.ip.config.allowImport
    ) {
      return null
    }
    return (async () => {
      const [first] = m.violations.values()
      // (a module's own mock is not asked here: `allowsSelf` chose it)
      if (
        !first?.self &&
        (await this.decide(
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
      for (const v of overtaken) {
        errors.push(this.devReport(v))
      }
      return this.errorOf(errors)
    })()
  }

  /**
   * Rspack: the violations a request of an import-protection module in a
   * child compiler of this environment (a worker or service-worker
   * plugin's) stands for: an edge module's, of its importer; the
   * runtime's, of the module that is its own violation. The modules are
   * virtual files of the environment's compiler, which a child compiler
   * cannot load, so each fails the build (`childCompilerReports`). Null for
   * any other request, or when no violation is known.
   */
  childCompilerViolations(
    request: string,
    issuer: string | undefined,
  ): Array<EdgeViolation> | null {
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
    return violations.length > 0 ? violations : null
  }

  /**
   * The reports of a child compiler's violations (`childCompilerViolations`),
   * each told to `onViolation` with its trace in the child compilation's
   * `graph` (null: the records' trace): errors, whatever the behavior.
   */
  async childCompilerReports(
    violations: ReadonlyArray<EdgeViolation>,
    graph: NodeGraph | null,
  ): Promise<Array<string>> {
    const reports: Array<string> = []
    for (const v of violations) {
      const denied = { ...v, behavior: 'error' as const }
      const trace = this.trace(v.importerId, graph)
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
    for (const file of [...this.deferredByFile.keys()]) {
      this.releaseDeferred(file, (importerId) => !holds(importerId))
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
    this.releaseDeferred(path, () => true)
  }

  /** Releases the deferred violations of importers of `file` that `gone` says are gone (`RegisteredModule.deferred`). */
  private releaseDeferred(
    file: string,
    gone: (importerId: string) => boolean,
  ): void {
    const keys = this.deferredByFile.get(file)
    if (!keys) {
      return
    }
    for (const key of keys) {
      const deferred = this.modules.get(key)?.deferred
      // (the key stays indexed under the file while one of its importers
      // still defers there)
      let remains = false
      for (const [k, v] of deferred ?? []) {
        if (traceFile(v.importerId) !== file) {
          continue
        }
        if (gone(v.importerId)) {
          deferred!.delete(k)
        } else {
          remains = true
        }
      }
      if (!remains) {
        keys.delete(key)
      }
    }
    if (keys.size === 0) {
      this.deferredByFile.delete(file)
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
    if (this.edgeStates.get(key)?.verdict === 'real') {
      return {
        code: allowedModuleCode(c, c.resolved ?? c.specifier),
        moduleSideEffects: null,
      }
    }
    return {
      code: mockModuleCode(c, runtime, this.ip.productionMock, this.publicName),
      moduleSideEffects: c.evaluated ? true : null,
    }
  }

  /** Whether this environment registered a mock (an edge module, a module that is its own violation): a build with none reads no chunk. */
  hasMocks(): boolean {
    return this.modules.size > 0
  }

  /**
   * The chunk readers' view of this environment's mocks: its edge modules
   * and the modules that are their own violation, as the ledger says they
   * were served (one served real, an allowed edge, a file with real demand,
   * is no mock).
   */
  mocks(): MockLookup {
    const edges = mockLookup(
      this.ip.ids,
      this.name,
      (key) =>
        this.modules.has(key) && this.edgeStates.get(key)?.verdict !== 'real',
    )
    return (id) => {
      const served = this.served.get(normalizePath(id))
      if (served && served.verdict === 'mock') {
        const key = served.self.module.key
        if (this.modules.has(key)) {
          return key
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
      if (holds && !holds(id)) {
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
   * A build output's verdict: the edge modules in its chunks (`liveKeys`,
   * from `rolldownMocksInChunks`/`rspackMocksInChunks`: what the final
   * client bundle holds) tell which violations stayed; a mock in no chunk is
   * no report;
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
    /**
     * The environment's resolver (a specifier from an importer to the id it
     * resolves to, or null): where an importer the compiler does not compile
     * imports a marked file by a name that is not the file's (a package's
     * name, an export map).
     */
    resolve?: (specifier: string, importer: string) => Promise<string | null>,
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
        if (entry?.verdict === 'real' && holds(id) && !demanded.has(id)) {
          unsettled.set(id, { verdict: 'real', self: entry.self, order: null })
        }
      }
    }
    // the mocked modules that are their own violation whose every importer is not checked (R89), with those importers
    const unchecked = new Map<string, [EdgeViolation, Array<string>]>()
    // those nothing imports in the build's graph (`imported`): no supported
    // configuration has one (one entry per environment; a dev server reports
    // the file when it compiles it), so no report accounts for it (design 4,
    // I5)
    const unaccounted: Array<EdgeViolation> = []
    const host = graph.built ?? graph
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
        // (the chunk reader finds a served mock; the key may stand for other ids too)
        if (
          this.served.get(id)?.verdict !== 'mock' ||
          unsettled.has(id) ||
          conflicts.has(id)
        ) {
          continue
        }
        // one report per checked import that reaches it: a denied handoff
        // as recorded, an import the compiler does not read by its importer;
        // those of the importers the output has, else every one (a barrel
        // that only re-exports it leaves no module of its own in a chunk)
        const incoming = this.incoming(v, graph)
        const inChunks = incoming.checked.filter(
          (c) =>
            c.handoff ||
            !host.kept ||
            host.kept({ env: c.env, id: c.importerId }),
        )
        for (const c of inChunks.length > 0 ? inChunks : incoming.checked) {
          const owner = this.ip.liveEnv(c.env) ?? this
          add(c.handoff ?? (await owner.importOf(v, c, resolve)), owner)
        }
        const others = new Set([...incoming.exempt, ...incoming.unread])
        if (incoming.checked.length === 0 && others.size > 0) {
          unchecked.set(v.edgeKey, [v, [...others]])
        } else if (
          incoming.checked.length === 0 &&
          !this.imported(v, graph.built ?? graph)
        ) {
          unaccounted.push(v)
        }
      }
    }
    // an entry's own marker: the entry runs, whatever the form of its marker
    // import or what the host's TypeScript makes of it (SWC drops
    // `export {} from`: its mock is never imported)
    const survived = new Set(liveKeys)
    for (const [key, m] of host.kept ? this.modules : []) {
      if (survived.has(key) || this.edgeStates.get(key)?.verdict === 'real') {
        continue
      }
      for (const v of m.violations.values()) {
        if (v.ownMarker && host.kept!({ env: this.name, id: v.importerId })) {
          add(v)
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
   * (`incoming`), found by the pattern import in its text, or, for a marked
   * file, by the literal that names the file (a package module the compiler
   * does not compile).
   */
  private async importOf(
    self: EdgeViolation,
    c: CheckedEdge,
    resolve?: (specifier: string, importer: string) => Promise<string | null>,
  ): Promise<EdgeViolation> {
    const { self: _self, ...violation } = self
    const found = this.patternImportOf(c.importer, self.resolved!)
    return {
      ...violation,
      env: this.name,
      envType: this.type,
      edgeKey: `${self.edgeKey}\u0000${c.importerId}`,
      importer: c.importer,
      importerId: c.importerId,
      ...found,
      ...(found.pattern === null &&
        (await this.literalImportOf(c.importer, self.resolved!, resolve))),
    }
  }

  /**
   * Where an importer imports a denied file by an import the compiler does
   * not read (a package module, another plugin's import, a declaration the
   * compiler reads as a type that the host's TypeScript keeps): the first
   * string literal of its raw text naming the file, its position and code
   * frame. Read once the violation survived (a report).
   */
  private async literalImportOf(
    importer: string,
    resolved: string,
    resolve?: (specifier: string, importer: string) => Promise<string | null>,
  ): Promise<Pick<EdgeViolation, 'loc' | 'snippet' | 'specifier'> | null> {
    const text = this.ip.readSource(importer)
    if (text === null) {
      return null
    }
    const file = normalizePath(identify(resolved).path)
    let found = literalNaming(text, importer, file)
    // (a name that is not the file's: the one the resolver takes to it)
    for (const literal of resolve && !found ? stringLiterals(text) : []) {
      const id = /^[^\s]+$/.test(literal.specifier)
        ? await resolve!(literal.specifier, importer)
        : null
      if (id !== null && normalizePath(identify(id).path) === file) {
        found = literal
        break
      }
    }
    if (found === null) {
      return null
    }
    const locator = new Locator(text, importer, () => null)
    const loc = locator.at(found.offset)
    return {
      loc,
      snippet: loc && locator.frame(loc),
      specifier: found.specifier,
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
