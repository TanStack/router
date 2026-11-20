/**
 * Start's Rspack host of the compiler core on Rsbuild (see the core's
 * README.md, "Hosts"): the compile environments of each compiler (one per
 * Rsbuild environment, and one per Rspack layer of the server compiler whose
 * modules compile apart: RSC's `rsc`; `envOf` is the one reader of a
 * module's layer); the loader implementation compiling every id (env and
 * derived) of a module of a compile environment through the shared Start
 * session (`compiler/session.ts`), from one `pre` loader per compiler
 * (`compiler-loader.ts`); the server-fn facts and the plan's dependencies
 * persisted in the modules' `buildInfo`; and the intake of file events and
 * registry changes into the one invalidation operation, whose stale sets
 * the compilers take at `finishMake` (a module depends on no file but its
 * own). The Rspack hooks live in `host-plugin.ts`; this module is
 * bundler-API free except for the loader context shape.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  StaleSetDrain,
  collectionSizes,
  composeLoaderMap,
  identify,
  invalidate,
  langFromId,
  loaderText,
  locatedDiagnostic,
  normalizePath,
  pathOfId,
  pathsOf,
  planDependencyFiles,
  planKeyString,
  registerCompilerStats,
  restorePlans,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'
import { StartCompilerSession, serverFnFactsOf } from '../compiler/session'
import { isVueSfc } from '../compiler/vue'
import { providerModuleId } from '../server-fns/registry'
import {
  CALLABLE_IDS_PLACEHOLDER,
  manifestResolverModule,
} from '../server-fns/resolver'
import { rspackEdgeModuleIds } from '../import-protection/edge-modules'
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/violations'
import {
  RSBUILD_ENVIRONMENT_NAMES,
  RSBUILD_RSC_LAYERS,
  RSBUILD_RSC_LAYER_RESOLVE,
} from './planning'
import { runsAgainLater } from './vue'
import type {
  StartCompilerEnvironment,
  StartCompilerSessionOptions,
} from '../compiler/session'
import type { LoaderChainLike } from './vue'
import type { CompiledOutputLike } from '../import-protection/session'
import type { DevViolationError } from '../import-protection/report'
import type { ImportRewrite } from '../planners/edges'
import type { ServerFnFact } from '../server-fns/registry'
import type { Rspack } from '@rsbuild/core'
import type {
  CompileOutput,
  DiagnosticPosition,
  HostServices,
  IdleCompilerLike,
  InputSourceMap,
  InvalidateChange,
  LocatedDiagnostic,
  LocatedDiagnosticsOptions,
  PersistedPlan,
  PlanKey,
  RecordMapText,
} from '@tanstack/router-utils/compiler'

/**
 * Whether an emitted asset is JavaScript: the assets whose server-fn ids
 * the host patches, whose code decides the callable set, and whose
 * callable-ids placeholder the RSC build fills in.
 */
export function isJsAsset(name: string): boolean {
  return /\.[cm]?js$/.test(name)
}

/** The `buildInfo` field holding a module's server-fn facts (persisted by Rspack's cache; replayed at `finishMake`). */
export const SERVER_FN_BUILD_INFO_FIELD = 'tanstack.start.serverFns'

/** The `buildInfo` field holding the key and dependencies of a module's plan, as JSON (persisted by Rspack's cache; checked at a compiler's first `finishMake`). */
export const PLAN_BUILD_INFO_FIELD = 'tanstack.start.plan'

/**
 * How the loader reports a compile's diagnostics, and the `buildInfo` field
 * holding them with their positions (`LocatedDiagnostic`), in the order they
 * were reported: Rspack keeps no location of a loader's warning or error, so
 * the host plugin gives them one after the seal (`locateDiagnostics`).
 */
export const LOCATED_DIAGNOSTICS: LocatedDiagnosticsOptions = {
  field: 'tanstack.start.diagnostics',
  errorName: 'TanStackStartCompilerError',
  warningName: 'TanStackStartCompilerWarning',
  failureName: 'TanStackStartCompilerError',
  // Start builds through Rsbuild, which prints a located error's `file`
  fileOfDerived: true,
}

export interface ServerFnBuildInfo {
  version: 4
  canonicalId: string
  facts: Array<ServerFnFact>
}

/** Rsbuild `source.transformImport` entries (the array form) the host predicts, so the file and
 * marker rules judge the rewritten import's target. */
export interface TransformImportRule {
  libraryName: string
  libraryDirectory?: string
  customName?: string | ((member: string) => string | undefined)
  camelToDashComponentName?: boolean
  ignoreEsComponent?: Array<string>
}

/**
 * The compile environment of the server compiler's RSC layer (RSC on):
 * where server components render, Start's server-fn provider; the name
 * reports and import protection's callbacks give it (`info.env`).
 */
export const RSBUILD_RSC_ENVIRONMENT = 'rsc'

/** Between a compiler's name and a user layer's in the key of the layer's compile environment (`envOf`). */
const USER_LAYER_SEPARATOR = ':'

/** The Start session's options an Rsbuild plugin gives (the rest is the Rsbuild host's): `environments`, its compilers'. */
type StartRsbuildSessionOptions = Omit<
  StartCompilerSessionOptions,
  | 'providerEnv'
  | 'hmrStyle'
  | 'edgeModuleIds'
  | 'readFile'
  | 'loadVirtual'
  | 'label'
>

/** What the loader implementation uses of Rspack's loader context. */
interface LoaderContextLike extends LoaderChainLike {
  resource: string
  resourcePath: string
  sourceMap?: boolean
  addDependency: (file: string) => void
  emitWarning: (error: Error) => void
  _module?: { buildInfo?: Record<string, unknown>; layer?: string | null }
  _compiler?: { isChild: () => boolean }
}

interface LoaderResult {
  code: string | Buffer
  map: unknown
}

export interface LoaderOptions {
  /** The loader's compiler (its Rsbuild environment). */
  environment: string
  /** `late`: the J6-only pass over the JS output of a non-JS module
   * (`.vue`, `.mdx`: Tier 0 only, with a host-supplied language). */
  pass?: 'late' | 'edge' | 'asset'
}

/** What a compiler (an Rsbuild environment) owns for every compile environment it builds. */
interface CompilerState {
  /** The Rsbuild environment. */
  name: string
  type: 'client' | 'server'
  transformImport: Array<TransformImportRule>
  /** Where the file's text goes when the module map names it without it (host: `emittedMapTexts`). */
  recordMapText: RecordMapText | null
  /**
   * Whether the compiler's cache outlives the process (Rspack's persistent or
   * filesystem cache): only then do modules carry their plan (another process
   * restores them; Rspack copies a module's custom `buildInfo` into the
   * module at every build while any cache is on).
   */
  persistsModules: boolean
  /** The compile environments whose modules it builds, by key (its own first). */
  envs: Map<string, EnvState>
}

/** A compile environment of a compiler (`StartCompilerEnvironment`: its key is `name`). */
export interface EnvState extends StartCompilerEnvironment {
  compiler: CompilerState
  /** The rule `resolve` options its layer's modules resolve with, over the compiler's (RSC: `RSBUILD_RSC_LAYER_RESOLVE`). */
  resolve: Rspack.RuleSetRule['resolve'] | undefined
  /**
   * The modules the loader compiled in the current compilation, by resource
   * (host: cleared at `thisCompilation`). The compiler's only: a child
   * compiler's (a worker's) module of the same resource and environment is
   * another module, and the compiler's own one may be restored from the
   * persistent cache (its readers walk the compiler's compilation).
   */
  compiled: Set<string>
}

/** The session every compiler of one Rsbuild plugin shares. */
export class StartRsbuildCompilerSession {
  /** The bundler-free Start session (caches, import protection, registry, warnings, compiles). */
  readonly start: StartCompilerSession
  /** The compilers, by Rsbuild environment. */
  readonly compilers = new Map<string, CompilerState>()
  /** The compile environments, by key. */
  readonly envs = new Map<string, EnvState>()
  /** Readers of files through the compilers' input file systems (virtual modules included), by compiler. */
  readonly inputFileSystems = new Map<
    string,
    (file: string) => Promise<string | null>
  >()
  /**
   * The resolver of each compiler, for its environments' compiles and
   * invalidations: the one a loader's `getResolve()` gives, asked outside
   * any loader (Rspack would record every file it looks at as a dependency
   * of the module compiling).
   */
  readonly resolvers = new Map<
    string,
    (
      importerDir: string,
      specifier: string,
      /** A layer environment's rule options over the compiler's (`hostFor`). */
      options: Rspack.RuleSetRule['resolve'],
    ) => Promise<string | null>
  >()
  /** The compilers' side of the stale sets: each takes its environments' at `finishMake`. */
  readonly drain: StaleSetDrain
  /** RSC on: the server compiler's RSC layer is the `rsc` environment. */
  private readonly rscEnabled: boolean
  /** Whether the constructor created the Start session and the drain. */
  private started = false
  /**
   * The HTTP-callable server fns of the last client build (J4.2, R182):
   * those its emitted code calls (`publishClientOutput`); null before the
   * client's first build.
   */
  private callableIds: ReadonlySet<string> | null = null

  constructor(opts: StartRsbuildSessionOptions) {
    this.rscEnabled = opts.rsc !== undefined
    const environments: Array<StartCompilerEnvironment> = []
    for (const { name, type } of opts.environments) {
      const compiler: CompilerState = {
        name,
        type,
        transformImport: [],
        recordMapText: null,
        persistsModules: false,
        envs: new Map(),
      }
      this.compilers.set(name, compiler)
      environments.push(this.addEnv({ name, type }, compiler, undefined))
      if (this.rscEnabled && name === RSBUILD_ENVIRONMENT_NAMES.server) {
        environments.push(
          this.addEnv(
            {
              name: RSBUILD_RSC_ENVIRONMENT,
              type,
              // (the RSC plugin adds the SSR layer's module of a client
              // reference the RSC layer imports)
              clientReferencesInto: name,
            },
            compiler,
            RSBUILD_RSC_LAYER_RESOLVE,
          ),
        )
      }
    }
    this.start = new StartCompilerSession({
      ...opts,
      environments,
      // the SSR environment provides the server functions; under RSC, the
      // RSC layer's
      providerEnv: this.rscEnabled
        ? RSBUILD_RSC_ENVIRONMENT
        : RSBUILD_ENVIRONMENT_NAMES.server,
      hmrStyle: 'webpack',
      edgeModuleIds: rspackEdgeModuleIds(
        `${normalizePath(opts.root)}/node_modules/.virtual/tanstack-start/import-protection`,
      ),
      readFile: (file) => this.readFile(file),
      // our virtual modules go through `readFile`
      loadVirtual: () => Promise.resolve(null),
      label: 'start:rsbuild',
    })
    // the environment compilers build their stale paths again at
    // `finishMake`: a stale importer explains a marked module (ruling B)
    this.start.ip?.useStaleImporters(this.start.caches.stale)
    this.drain = new StaleSetDrain(this.start.caches, {
      tag: '[tanstack-start]',
      root: opts.root,
    })
    this.started = true
    registerCompilerStats(
      'start:rsbuild:host',
      this,
      StartRsbuildCompilerSession.readStats,
    )
  }

  private static readStats(o: StartRsbuildCompilerSession) {
    return collectionSizes({ envs: o.envs, missing: o.missing }, 4)
  }

  /** A compile environment of `compiler`, known from here on (the session's, the drain's). */
  private addEnv(
    env: StartCompilerEnvironment,
    compiler: CompilerState,
    resolve: Rspack.RuleSetRule['resolve'] | undefined,
  ): EnvState {
    const state: EnvState = { ...env, compiler, resolve, compiled: new Set() }
    this.envs.set(env.name, state)
    compiler.envs.set(env.name, state)
    // (the constructor's are in the options of the sessions it creates)
    if (this.started) {
      this.start.addEnvironment(env)
      this.drain.addEnvironment(compiler.name, env.name)
      for (const listener of this.listeners.get(compiler.name) ?? []) {
        listener(state)
      }
    }
    return state
  }

  /** By compiler, what is told of a compile environment found after the session started (`onEnvironment`). */
  private readonly listeners = new Map<string, Array<(env: EnvState) => void>>()

  /** Tells `listener` of each compile environment of `compiler` found from here on (a user layer's). */
  onEnvironment(compiler: string, listener: (env: EnvState) => void): void {
    const list = this.listeners.get(compiler)
    if (list) {
      list.push(listener)
    } else {
      this.listeners.set(compiler, [listener])
    }
  }

  /** A compiler (an Rsbuild environment). */
  compiler(name: string): CompilerState {
    const compiler = this.compilers.get(name)
    if (!compiler) {
      throw new Error(`[tanstack-start] unknown Rsbuild environment "${name}"`)
    }
    return compiler
  }

  /** A compile environment, by key. */
  env(key: string): EnvState {
    const env = this.envs.get(key)
    if (!env) {
      throw new Error(`[tanstack-start] unknown compile environment "${key}"`)
    }
    return env
  }

  /**
   * The compile environment of a module of `compiler` in Rspack layer
   * `layer`: the one reader of a module's layer. The server compiler's RSC
   * layer (RSC on) is `rsc`; its SSR layer and no layer are the compiler's
   * own; any other layer (a user's rule) is one of its own, which resolves
   * with the compiler's base options (a rule's own `resolve` does not reach
   * the compiler's resolver) and which reports call by the compiler's name.
   * A child compiler's module (a worker's) maps as its parent's.
   */
  envOf(compiler: string, layer: string | null | undefined): EnvState {
    const c = this.compiler(compiler)
    if (
      !layer ||
      (this.rscEnabled &&
        compiler === RSBUILD_ENVIRONMENT_NAMES.server &&
        layer === RSBUILD_RSC_LAYERS.ssr)
    ) {
      return c.envs.get(compiler)!
    }
    if (
      this.rscEnabled &&
      compiler === RSBUILD_ENVIRONMENT_NAMES.server &&
      layer === RSBUILD_RSC_LAYERS.rsc
    ) {
      return c.envs.get(RSBUILD_RSC_ENVIRONMENT)!
    }
    const key = `${compiler}${USER_LAYER_SEPARATOR}${layer}`
    return (
      c.envs.get(key) ??
      this.addEnv(
        { name: key, type: c.type, publicName: compiler },
        c,
        undefined,
      )
    )
  }

  /**
   * The compile environment of a key (`envOf`'s keys), known or not yet: a
   * persisted request of an importer restored in a new process names a user
   * layer's environment before any module of the layer was seen. Undefined
   * for a key no compiler of the session builds.
   */
  envOfKey(key: string): EnvState | undefined {
    const known = this.envs.get(key)
    if (known) {
      return known
    }
    const at = key.indexOf(USER_LAYER_SEPARATOR)
    const compiler = at > 0 ? key.slice(0, at) : null
    return compiler !== null && this.compilers.has(compiler)
      ? this.envOf(compiler, key.slice(at + 1))
      : undefined
  }

  /**
   * The compile environment of a module of `compiler` (an inner module of a
   * concatenation: `holder`'s layer when it has none): a Start edge module's
   * is the one its id names, wherever a user's rule puts the file (a
   * `.mjs` rule's layer); any other module's that of its layer (`envOf`).
   */
  envOfModule(
    compiler: string,
    module: { resource?: string; layer?: string | null },
    holder: { layer?: string | null } = module,
  ): EnvState {
    const ref = module.resource
      ? this.start.ip?.ids.parse(module.resource)
      : null
    return (
      (ref && this.envOfKey(ref.env)) ||
      this.envOf(compiler, module.layer ?? holder.layer)
    )
  }

  /** The compile environments a compiler builds (its own first). */
  envsOf(compiler: string): Iterable<EnvState> {
    return this.compiler(compiler).envs.values()
  }

  /** The compiler that builds a compile environment's modules (its virtual files, resolver, input file system). */
  compilerOf(key: string): string | undefined {
    return this.envs.get(key)?.compiler.name
  }

  /**
   * Reads a file: our virtual modules (`node_modules/.virtual/`) through the
   * compilers' input file systems, real files from the disk. At `watchRun` a
   * compiler's input file system holds a file it watches as fresh, keeps an
   * unwatched one it has read stale until its 60 s TTL (the disk is the truth of
   * an edited dependency), and cannot read Rspack's `VirtualModulesPlugin`
   * files: those reads miss and our virtual modules are missing to the raw
   * facts, unless a user replaced the file system (`webpack-virtual-modules`
   * with `useInputFileSystem`).
   */
  async readFile(file: string): Promise<string | null> {
    if (file.includes('/node_modules/.virtual/')) {
      for (const read of this.inputFileSystems.values()) {
        const text = await read(file)
        if (text !== null) {
          return text
        }
      }
      this.missing.add(file)
      return null
    }
    try {
      return await fs.promises.readFile(file, 'utf8')
    } catch {
      this.missing.add(file)
      return null
    }
  }

  /** Paths a read found missing (their raw facts say so until an event or `forgetMisses`). */
  private readonly missing = new Set<string>()

  /** Drops every missing-file fact (a file may appear without an event: nothing watches it). */
  forgetMisses(): void {
    for (const file of this.missing) {
      this.start.rawFacts.markStale(file)
    }
    this.missing.clear()
  }

  /**
   * The import rewrite of a compiler: the file a request with inline
   * loaders loads (`!!raw-loader!./x.ts`, `-!./x.ts`: its last segment,
   * whatever loaders run on it), and `source.transformImport`.
   */
  private importRewrite(compiler: CompilerState): ImportRewrite {
    const rules = compiler.transformImport
    return (specifier, names) => {
      const bang = specifier.lastIndexOf('!')
      if (bang !== -1) {
        return [specifier.slice(bang + 1)]
      }
      const rule = rules.find((r) => r.libraryName === specifier)
      if (!rule) {
        return null
      }
      const members = names.filter((n) => n !== 'default' && n !== '*')
      if (members.length === 0 || names.includes('*')) {
        return null
      }
      const out: Array<string> = []
      for (const member of members) {
        if (rule.ignoreEsComponent?.includes(member)) {
          out.push(specifier)
          continue
        }
        out.push(rewrittenSpecifier(rule, member))
      }
      return out
    }
  }

  private readonly hosts = new Map<string, HostServices>()

  /**
   * The host services of the compiles and invalidations of a compile
   * environment's modules: its compiler's resolver (aliases and conditions
   * differ by compiler) with the environment's rule options (the RSC
   * layer's add `RSBUILD_RSC_LAYER_RESOLVE`). The resolution memo is the
   * environment's plan cache's.
   */
  private hostFor(env: EnvState): HostServices {
    let host = this.hosts.get(env.name)
    if (!host) {
      const compiler = env.compiler.name
      const resolve = this.resolvers.get(compiler)
      if (!resolve) {
        throw new Error(
          `[tanstack-start] no resolver for the Rsbuild environment "${compiler}"`,
        )
      }
      // Rspack's resolver is given the importer's directory (`resolve(_context, path, request)`,
      // 2.3.1: the context never reaches the native resolver), so the memo keys answers by it.
      // Options that depend on the issuer (a matched rule's `resolve`, `issuerLayer`) would
      // join the key; an environment's are the same for each of its modules
      const dirOf = (importer: string) => path.dirname(pathOfId(importer))
      const options = env.resolve
      host = this.start.host(
        async (specifier, importer) => {
          const id = await resolve(dirOf(importer), specifier, options)
          return id === null ? null : { id }
        },
        { importRewrite: this.importRewrite(env.compiler) },
      )
      host.resolveKey = dirOf
      this.hosts.set(env.name, host)
    }
    return host
  }

  /** The host of a plan's module: its environment's (the plan key names it). */
  private hostOfPlan(key: PlanKey): HostServices {
    return this.hostFor(this.env(key.env))
  }

  /** What each compiler's last compilation depended on (its file events; dev: `retain`). */
  readonly files = new CompilationFiles()

  /**
   * After a compiler's dev compilation (`files` recorded its dependencies):
   * forget what the session holds of files the compilation no longer
   * depends on (the plans of each of its environments, raw facts, import
   * protection's scope cache; its importer records follow the modules each
   * compilation holds, at `finishMake`). Rspack reports a deleted file only while a module depends on it,
   * so a module the app stopped importing and then deleted never gets its
   * `unlink`; without this its state stayed for the session (every cache
   * must stay bounded by the live modules). Called only when the files
   * changed (not on an edit).
   */
  retain(compiler: string): void {
    const live = this.files.of(compiler)
    const isFile = (path: string) =>
      path.startsWith('/') || /^[A-Za-z]:\//.test(path)
    const keepIn =
      (set: (path: string) => boolean) =>
      (path: string): boolean =>
        !isFile(path) || path.includes('/node_modules/.virtual/') || set(path)
    const keepEnv = keepIn((p) => live.has(p))
    for (const env of this.envsOf(compiler)) {
      const plans = this.start.caches.plans.get(env.name)
      if (plans) {
        for (const key of plans.keys()) {
          if (!keepEnv(identify(key.canonicalId).path)) {
            plans.delete(key)
          }
        }
      }
    }
    // (counted in compilers: the files are theirs)
    if (this.files.size === this.compilers.size) {
      // shared state: kept while any compiler depends on the file
      const anyEnv = keepIn((p) => this.files.known(p))
      this.start.rawFacts.retain((id) => anyEnv(identify(id).path))
      this.start.ip?.retain(anyEnv)
    }
  }

  /**
   * After the last pass of a compiler's production build: releases the
   * plans and the import protection of each of its environments. What the
   * environments share (raw facts, registry, id allocator, warnings) stays.
   */
  release(compiler: string): void {
    for (const env of this.envsOf(compiler)) {
      this.start.release(env.name)
      env.compiled = new Set()
    }
    this.files.forget(compiler)
  }

  /**
   * The one invalidation operation: the stale plans' files enter their
   * environment's stale set, which its compiler takes at `finishMake`.
   */
  async invalidate(
    file: string,
    kind: InvalidateChange['kind'],
  ): Promise<void> {
    await invalidate(
      this.start.caches,
      { path: normalizePath(file), kind },
      (key) => this.hostOfPlan(key),
    )
  }

  /**
   * The file events of a compilation that starts: each compiler
   * forwards its own (a repeat of another compiler's changes nothing), all
   * at once (calls for one path queue in the core).
   */
  async invalidateFileEvents(
    events: ReadonlyArray<{ file: string; kind: FileEventKind }>,
  ): Promise<void> {
    await Promise.all(
      events.map(({ file, kind }) => this.invalidate(file, kind)),
    )
  }

  /**
   * A compiler, with the environments it builds, for the stale-set drain.
   * Under RSC, Rspack's coordinator starts each client compilation from a
   * server compilation: the client's stale set gets the server compiler a
   * compilation.
   */
  registerCompiler(name: string, compiler: IdleCompilerLike): void {
    this.drain.register(
      name,
      compiler,
      this.rscEnabled && name === RSBUILD_ENVIRONMENT_NAMES.client
        ? RSBUILD_ENVIRONMENT_NAMES.server
        : undefined,
    )
    for (const env of this.envsOf(name)) {
      this.drain.addEnvironment(name, env.name)
    }
  }

  /** Unsubscribes the route listener (`listenToRoutes`). */
  private unlistenRoutes: (() => void) | null = null

  /**
   * Invalidates the route files whose registry entry changed (the generator
   * published new route ids: Rspack sees no file event for them), once per
   * publication for every compiler of the session; returns the
   * unsubscribe.
   */
  listenToRoutes(generator: {
    onRoutesChanged: (listener: (files: Array<string>) => void) => () => void
  }): () => void {
    this.unlistenRoutes ??= generator.onRoutesChanged((files) => {
      this.registryChanged(files).catch((error: unknown) => {
        console.error(
          `[tanstack-start] invalidating after a route change failed:`,
          error,
        )
      })
    })
    return () => {
      this.unlistenRoutes?.()
      this.unlistenRoutes = null
    }
  }

  /**
   * A registry change: its files are stale in every environment that
   * compiled; idle compilers are asked to build them (after a failed
   * invalidation too: what it made stale before gets its compilation).
   */
  private async registryChanged(files: ReadonlyArray<string>): Promise<void> {
    try {
      await Promise.all(files.map((file) => this.invalidate(file, 'registry')))
    } finally {
      this.drain.registryChanged()
    }
  }

  /**
   * The files the plans of a compilation's modules read, but the modules'
   * own (`planDependencyFiles`): `paths`, each environment's module paths.
   */
  dependencyFiles(
    paths: ReadonlyMap<string, ReadonlySet<string>>,
  ): Set<string> {
    const out = new Set<string>()
    for (const [env, own] of paths) {
      for (const file of planDependencyFiles(this.start.caches, env, own)) {
        if (!own.has(file) && path.isAbsolute(file)) {
          out.add(file)
        }
      }
    }
    return out
  }

  /**
   * The plans an earlier process persisted with a compiler's modules
   * (`PLAN_BUILD_INFO_FIELD`), which Rspack's persistent cache restored
   * without a compile, each with its module's environment (`envOf`): each
   * one of that environment, compiled with this session's configuration,
   * and whose dependencies are all current joins the session's plans
   * (`restorePlans`); the files of the others enter their module's
   * environment's stale set (built again by the drain that follows).
   */
  async restorePlans(
    modules: Iterable<{ plan: PersistedPlan; env: EnvState }>,
  ): Promise<void> {
    const current = new Map<string, PersistedPlan>()
    const stale: Array<{ env: string; key: PlanKey }> = []
    for (const { plan, env } of modules) {
      if (
        plan.key.env === env.name &&
        this.start.configured(plan.key.configKey, env)
      ) {
        current.set(planKeyString(plan.key), plan)
      } else {
        stale.push({ env: env.name, key: plan.key })
      }
    }
    for (const key of await restorePlans(
      this.start.caches,
      current.values(),
      (key) => this.hostOfPlan(key),
    )) {
      stale.push({ env: key.env, key })
    }
    for (const { env, key } of stale) {
      for (const file of pathsOf([key])) {
        this.start.caches.stale.add(env, file)
      }
    }
  }

  /**
   * The loader implementation: compiles every id (env and derived) of a
   * JS/TS module of an environment from the text Rspack hands it (never
   * from a path-only "latest plan", so upstream loaders and maps compose;
   * the loader is raw: a module it does not compile goes on as its bytes),
   * composes maps with the input map, records dependencies, server-fn
   * facts (`buildInfo`, for the replay) and import-protection records, and
   * reports diagnostics.
   */
  async compile(
    ctx: LoaderContextLike,
    bytes: Buffer,
    inputMap: unknown,
    options: LoaderOptions,
  ): Promise<LoaderResult> {
    const env = this.envOfModule(options.environment, {
      resource: ctx.resource,
      layer: ctx._module?.layer,
    })
    const passthrough: LoaderResult = { code: bytes, map: inputMap }
    const { ip } = this.start
    if (options.pass === 'edge') {
      // the bundler requested this edge module from the importer's post-SWC
      // code: `allowImport` decides between the real module and the mock
      const ipEnv = ip?.env(env.name)
      if (!ctx._compiler?.isChild()) {
        env.compiled.add(ctx.resource)
      }
      const error = await ipEnv?.confirm(ctx.resource)
      if (error) {
        // (it fails the edge module: Rspack reports it there, not at the importer)
        throwLocated(ctx, error as DevViolationError)
      }
      const code = ip?.load(ctx.resource)?.code ?? bytes
      // (after the load: the state it served, for a restore to compare)
      const info = ipEnv?.edgeBuildInfo(ctx.resource)
      const buildInfo = ctx._module?.buildInfo
      if (info && buildInfo) {
        buildInfo[info.key] = info.value
      }
      return { code, map: null }
    }
    const id = canonicalResource(ctx.resource)
    if (options.pass === 'asset') {
      if (identify(id).lang !== null) {
        // the file's code (`x.ts?inline`): compiled by the loader
        return { code: '', map: null }
      }
      // never compiled, and an import the compiler does not read may have
      // brought it here: a denied file's text is served as its mock
      const asset = await this.start.assetOutput(env, id)
      return (
        (asset && (await this.protect(ctx, env, id, asset))) ?? {
          code: '',
          map: null,
        }
      )
    }
    const identity = identify(id)
    const late = options.pass === 'late'
    if (
      late
        ? identity.lang !== null || runsAgainLater(ctx)
        : identity.lang === null
    ) {
      return passthrough
    }
    const source = loaderText(bytes)
    if (!late && !this.start.compiles(identity.path, source)) {
      return passthrough
    }
    let parsedInputMap: InputSourceMap | null | undefined
    const readInputMap = (): InputSourceMap | null => {
      if (parsedInputMap === undefined) {
        parsedInputMap =
          typeof inputMap === 'string'
            ? (JSON.parse(inputMap) as InputSourceMap)
            : ((inputMap as InputSourceMap | undefined) ?? null)
      }
      return parsedInputMap
    }
    const out = await this.start.compile(
      {
        id,
        code: source,
        env,
        inputMap: readInputMap,
        wantMap: ctx.sourceMap !== false,
        // webpack-sources counts the map's lines at LF only
        lines: 'lf',
        late,
      },
      this.hostFor(env),
    )
    if (!out) {
      return passthrough
    }
    this.reportDiagnostics(
      ctx,
      out,
      identity.path,
      source,
      env.type,
      late || isVueSfc(identity.path) ? readInputMap : undefined,
    )
    const mock = await this.protect(ctx, env, id, out)
    const buildInfo = ctx._module?.buildInfo
    if (env.compiler.persistsModules && out.persisted && buildInfo) {
      // one string: Rspack converts a structured field value by value
      buildInfo[PLAN_BUILD_INFO_FIELD] = JSON.stringify(out.persisted)
    }
    const serverFns = serverFnFactsOf(out)
    if (serverFns && buildInfo) {
      buildInfo[SERVER_FN_BUILD_INFO_FIELD] = {
        version: 4,
        canonicalId: identity.canonicalId,
        facts: serverFns,
      } satisfies ServerFnBuildInfo
    }
    if (mock) {
      return mock
    }
    if (identity.derived === null && out.code === source) {
      return passthrough
    }
    return {
      code: out.code,
      map: composeLoaderMap(
        out.map,
        ctx.resourcePath,
        source,
        inputMap,
        env.compiler.recordMapText,
      ),
    }
  }

  /**
   * What follows a compile: the registry, and import protection's edges and,
   * in development, the violations of this compile (with `log: 'always'`,
   * decided at every compile), recorded in the module's `buildInfo`. The
   * module that is its own violation is served as its mock (returned), whose
   * virtual file a verdict rewrites (so the module is built again as it is).
   */
  private async protect(
    ctx: LoaderContextLike,
    env: EnvState,
    id: string,
    out: CompiledOutputLike,
  ): Promise<LoaderResult | null> {
    if (!ctx._compiler?.isChild()) {
      env.compiled.add(ctx.resource)
    }
    const outcome = this.start.afterCompile(env, id, out)
    const { error, mock } = outcome instanceof Promise ? await outcome : outcome
    if (error) {
      throwLocated(ctx, error as DevViolationError)
    }
    const buildInfo = ctx._module?.buildInfo
    const ipEnv = this.start.ip?.env(env.name)
    if (ipEnv && buildInfo) {
      const info = ipEnv.buildInfo(id, out)
      if (info) {
        buildInfo[info.key] = info.value
      } else {
        // a rebuild of a module that was its own violation
        delete buildInfo[RSPACK_BUILD_INFO_KEY]
      }
    }
    if (!mock) {
      return null
    }
    ctx.addDependency(mock.id)
    return { code: mock.code, map: null }
  }

  /**
   * Reports a compile's diagnostics: warnings to the loader context, the
   * errors thrown together (the module fails), and all of them with their
   * positions in the module's `buildInfo` (`LOCATED_DIAGNOSTICS`).
   */
  private reportDiagnostics(
    ctx: LoaderContextLike,
    out: CompileOutput,
    file: string,
    code: string,
    envType: 'client' | 'server',
    inputMap?: () => InputSourceMap | null,
  ): void {
    const located: Array<LocatedDiagnostic> = []
    const locate = (
      severity: LocatedDiagnostic['severity'],
      message: string,
      at: DiagnosticPosition | undefined,
    ) => {
      const d = locatedDiagnostic(severity, message, at)
      located.push(d)
      return d.message
    }
    const errors: Array<string> = []
    this.start.report(
      out,
      file,
      code,
      envType,
      {
        error: (d, at) => errors.push(locate('error', d.message, at)),
        warn: (d, at) => {
          const warning = new Error(locate('warning', d.message, at))
          warning.name = LOCATED_DIAGNOSTICS.warningName
          ctx.emitWarning(warning)
        },
      },
      inputMap,
    )
    const buildInfo = ctx._module?.buildInfo
    if (located.length > 0 && buildInfo) {
      buildInfo[LOCATED_DIAGNOSTICS.field] = located
    }
    if (errors.length > 0) {
      const error = new Error(errors.join('\n'))
      error.name = LOCATED_DIAGNOSTICS.errorName
      throw error
    }
  }

  /**
   * The resolver module of an environment: the registry's manifest, of the
   * client-referenced entries in production builds whose SSR environment is
   * the provider, and their client-origin calls gated to the functions the
   * client's emitted code calls (J4.2, R182; the resolver is written again
   * once the client compiled, before the server compiles); in development every entry, with a
   * warning for a client call of a function no client module references
   * (the client compilation's replay rewrites the resolver, so the flags
   * follow the client graph). The RSC provider lists its environment's
   * functions (the RSC build order).
   */
  /** A production client build emitted `codes` (its JS assets, minified and with final ids): the callable set. */
  publishClientOutput(codes: ReadonlyArray<string>): void {
    this.callableIds = this.start.clientCallableIds(codes)
  }

  resolverModule(): string {
    const { opts } = this.start
    return manifestResolverModule({
      entries: this.start.registry.entries(),
      providerModuleId,
      clientReferencedOnly: opts.mode === 'build' && opts.rsc === undefined,
      warnUnreferenced: opts.mode === 'dev' && opts.rsc === undefined,
      staticImports: opts.rsc !== undefined && opts.mode === 'dev',
      memoizeModules: opts.mode === 'build',
      // RSC build (J4.2): the RSC coordinator interleaves the server and client
      // compilations, so the manifest is generated before the client's
      // references are known; it lists every function (server-origin calls
      // reach the provider through it) and gates client-origin calls on a
      // set the server asset pipeline fills in once the client build exists
      clientOriginGate:
        opts.mode !== 'build'
          ? undefined
          : opts.rsc !== undefined
            ? JSON.stringify(CALLABLE_IDS_PLACEHOLDER)
            : JSON.stringify([...(this.callableIds ?? [])].sort()),
    })
  }

  /**
   * The JSON array of the HTTP-callable function ids (the RSC gate's set,
   * J4.2, R182): final ids, also with a custom generator (the gate is
   * filled in after the ids were patched, so its placeholders resolve here).
   */
  callableIdsLiteral(): string {
    if (!this.callableIds) {
      throw new Error(
        'TanStack Start could not gate the server functions of the rsbuild RSC server because the client build was unavailable',
      )
    }
    const allocator =
      this.start.allocator && this.start.allocateIds('client').allocator
    return JSON.stringify(
      [...this.callableIds]
        .map((id) => (allocator ? allocator.patch(id).code : id))
        .sort(),
    )
  }
}

/**
 * Fails the module with dev `error` violations, located like compile
 * errors: a record per report in the module's `buildInfo`, and the failure
 * the host replaces with them (no loader wrapper, no stack frames).
 */
function throwLocated(ctx: LoaderContextLike, error: DevViolationError): never {
  const buildInfo = ctx._module?.buildInfo
  if (buildInfo) {
    const records = (buildInfo[LOCATED_DIAGNOSTICS.field] ??
      []) as Array<LocatedDiagnostic>
    for (const report of error.reports) {
      records.push({ severity: 'error', message: report.message, ...report.at })
    }
    buildInfo[LOCATED_DIAGNOSTICS.field] = records
  }
  const failure = new Error(error.message)
  failure.name = LOCATED_DIAGNOSTICS.errorName
  failure.stack = `${failure.name}: ${error.message}`
  throw failure
}

/**
 * What each compiler's last compilation depended on (`fileDependencies`,
 * `contextDependencies`), normalized: tells a modified file's event. A file
 * no compiler's last compilation knows was created (an `add`: it may take
 * resolutions that failed before); one any compiler's knows was edited:
 * under RSC, Rspack's coordinator tells the client compiler the server's
 * changed files, which the client's compilation never read. A directory a
 * compilation watched (Tailwind CSS's scan) is reported as modified when
 * anything below it changes, which creates no file of its name.
 */
export class CompilationFiles {
  private readonly byEnv = new Map<
    string,
    { files: ReadonlySet<string>; directories: ReadonlySet<string> }
  >()

  /** Records an environment's compilation; whether its files differ from the last one's. */
  record(
    envName: string,
    files: Iterable<string>,
    directories: Iterable<string>,
  ): boolean {
    const live = new Set<string>()
    for (const f of files) {
      live.add(normalizePath(f))
    }
    const dirs = new Set<string>()
    for (const d of directories) {
      dirs.add(normalizePath(d))
    }
    const before = this.byEnv.get(envName)?.files
    this.byEnv.set(envName, { files: live, directories: dirs })
    return !(
      before?.size === live.size && [...live].every((f) => before.has(f))
    )
  }

  /** Whether an environment's compilation finished before (its first restores a persistent cache). */
  compiled(envName: string): boolean {
    return this.byEnv.has(envName)
  }

  /** The event of `file`, modified for the compilation `envName` starts (nothing known before its first: an edit). */
  eventOf(envName: string, file: string): FileEventKind | null {
    if (!this.compiled(envName)) {
      return 'change'
    }
    const path = normalizePath(file)
    if (this.known(path)) {
      return 'change'
    }
    for (const { directories } of this.byEnv.values()) {
      if (directories.has(path)) {
        return null
      }
    }
    return 'add'
  }

  /** Whether any environment's last compilation depended on the file (a normalized path). */
  known(path: string): boolean {
    for (const { files } of this.byEnv.values()) {
      if (files.has(path)) {
        return true
      }
    }
    return false
  }

  /** The files an environment's last compilation depended on. */
  of(envName: string): ReadonlySet<string> {
    return this.byEnv.get(envName)?.files ?? new Set()
  }

  /** How many environments compiled. */
  get size(): number {
    return this.byEnv.size
  }

  forget(envName: string): void {
    this.byEnv.delete(envName)
  }
}

/** A file event of a compilation: an edit, a creation, a removal. */
export type FileEventKind = 'change' | 'add' | 'unlink'

/**
 * A module resource as a compiler id. Rspack's RSC plugin requests a
 * `'use server-entry'` module's original content under its own query,
 * appended with a second `?` (`file?tss-serverfn-split?rsc-server-entry-proxy=true`):
 * the identity parser reads one query, so later `?` become `&`, and that
 * query names no other source (the same text, the same plan: the server fn
 * registry must point the resolver at `file?tss-serverfn-split`), so it is
 * dropped. So are the asset queries Rsbuild's script rules ignore on a
 * script (`x.ts?url`, `?sharedworker`: the file's code, which Vite's would
 * not be; it honours `?raw` and `?worker`).
 */
export function canonicalResource(resource: string): string {
  const normalized = webpackResourceId(resource)
  const q = normalized.indexOf('?')
  if (q === -1) {
    return normalized
  }
  const script = langFromId(normalized.slice(0, q)) !== null
  const query = normalized
    .slice(q + 1)
    .replace(/\?/g, '&')
    .split('&')
    .filter(
      (part) =>
        part !== '' &&
        !part.startsWith(RSC_PROXY_QUERY) &&
        !(script && IGNORED_SCRIPT_QUERIES.has(part)),
    )
    .join('&')
  return query.length > 0
    ? `${normalized.slice(0, q)}?${query}`
    : normalized.slice(0, q)
}

/**
 * The file of a module resource, as the stale sets and the plans spell it
 * (`identify(canonicalResource(resource)).path`: the id before its query),
 * without parsing the query: the drain and the watched-file scan ask it of
 * every module of every compilation.
 */
export function resourcePath(resource: string): string {
  return pathOfId(webpackResourceId(resource))
}

/** Rspack's RSC plugin's query on a server entry's original module. */
const RSC_PROXY_QUERY = 'rsc-server-entry-proxy'

/** The asset queries (`SCRIPT_ASSET_QUERY_RE`) under which Rsbuild runs a script's code. */
const IGNORED_SCRIPT_QUERIES = new Set(['url', 'sharedworker'])

const camelToDash = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/** The specifier Rsbuild's `source.transformImport` turns a member import into (its documented defaults). */
function rewrittenSpecifier(rule: TransformImportRule, member: string): string {
  if (typeof rule.customName === 'function') {
    return rule.customName(member) ?? rule.libraryName
  }
  const transformed =
    rule.camelToDashComponentName === false ? member : camelToDash(member)
  if (typeof rule.customName === 'string') {
    return rule.customName.replace(
      /\{\{\s*(?:(\w+)\s+)?member\s*\}\}/g,
      (_m, helper: string | undefined) => {
        switch (helper) {
          case 'kebabCase':
            return camelToDash(member)
          case 'camelCase':
            return member.charAt(0).toLowerCase() + member.slice(1)
          case 'snakeCase':
            return camelToDash(member).replace(/-/g, '_')
          case 'upperCase':
            return member.toUpperCase()
          case 'lowerCase':
            return member.toLowerCase()
          default:
            return member
        }
      },
    )
  }
  const dir = rule.libraryDirectory ?? 'lib'
  return `${rule.libraryName}/${dir}/${transformed}`
}
