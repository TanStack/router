/**
 * Start's Rspack host of the compiler core on Rsbuild (see the core's
 * README.md, "Hosts"): the loader implementation compiling every id (env and
 * derived) of a module of an environment and layer through the shared Start
 * session (`compiler/session.ts`), from one `pre` loader per environment
 * (`compiler-loader.ts`); the server-fn facts and the plan's dependencies
 * persisted in the modules' `buildInfo`; and the intake of file events and
 * registry changes into the one invalidation operation, whose stale sets
 * the environment compilers take at `finishMake` (a module depends on no
 * file but its own). The Rspack hooks live in `host-plugin.ts`; this module
 * is bundler-API free except for the loader context shape.
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
  CLIENT_REFERENCED_IDS_PLACEHOLDER,
  manifestResolverModule,
} from '../server-fns/resolver'
import { rspackEdgeModuleIds } from '../import-protection/edge-modules'
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/violations'
import {
  RSBUILD_ENVIRONMENT_NAMES,
  RSBUILD_RSC_LAYER_RESOLVE,
} from './planning'
import { runsAgainLater } from './vue'
import type { StartCompilerSessionOptions } from '../compiler/session'
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

/** The Start session's options an Rsbuild plugin gives (the rest is the Rsbuild host's). */
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
}

interface LoaderResult {
  code: string | Buffer
  map: unknown
}

export interface LoaderOptions {
  environment: string
  /** `late`: the J6-only pass over the JS output of a non-JS module
   * (`.vue`, `.mdx`: Tier 0 only, with a host-supplied language). */
  pass?: 'late' | 'edge' | 'asset'
}

interface EnvState {
  name: string
  type: 'client' | 'server'
  transformImport: Array<TransformImportRule>
  /** The resources the loader compiled in the current compilation (host: cleared at `thisCompilation`). */
  compiled: Set<string>
  /** Where the file's text goes when the module map names it without it (host: `emittedMapTexts`). */
  recordMapText: RecordMapText | null
  /**
   * Whether the compiler's cache outlives the process (Rspack's persistent or
   * filesystem cache): only then do modules carry their plan (another process
   * restores them; Rspack copies a module's custom `buildInfo` into the
   * module at every build while any cache is on).
   */
  persistsModules: boolean
}

/** The session every compiler of one Rsbuild plugin shares. */
export class StartRsbuildCompilerSession {
  /** The bundler-free Start session (caches, import protection, registry, warnings, compiles). */
  readonly start: StartCompilerSession
  readonly envs = new Map<string, EnvState>()
  /** Readers of files through the compilers' input file systems (virtual modules included), by environment. */
  readonly inputFileSystems = new Map<
    string,
    (file: string) => Promise<string | null>
  >()
  /**
   * The resolver of each environment, for its compiles and its
   * invalidations: the one a loader's `getResolve()` gives, asked outside
   * any loader (Rspack would record every file it looks at as a dependency
   * of the module compiling).
   */
  readonly resolvers = new Map<
    string,
    (
      importerDir: string,
      specifier: string,
      /** A layer's rule options over the environment's (`hostFor`). */
      options: Rspack.RuleSetRule['resolve'],
    ) => Promise<string | null>
  >()
  /** The environment compilers' side of the stale sets: each takes its own at `finishMake`. */
  readonly drain: StaleSetDrain
  /** The RSC layer of the server environment (RSC on). */
  private readonly rscLayer: string | undefined

  constructor(opts: StartRsbuildSessionOptions) {
    this.rscLayer = opts.rscLayer
    for (const env of opts.environments) {
      this.envs.set(env.name, {
        name: env.name,
        type: env.type,
        transformImport: [],
        compiled: new Set(),
        recordMapText: null,
        persistsModules: false,
      })
    }
    this.start = new StartCompilerSession({
      ...opts,
      // the server environment provides the server functions (under RSC,
      // its RSC layer: `rscLayer`)
      providerEnv: RSBUILD_ENVIRONMENT_NAMES.server,
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
    registerCompilerStats(
      'start:rsbuild:host',
      this,
      StartRsbuildCompilerSession.readStats,
    )
  }

  private static readStats(o: StartRsbuildCompilerSession) {
    return collectionSizes({ envs: o.envs, missing: o.missing }, 4)
  }

  env(name: string): EnvState {
    const env = this.envs.get(name)
    if (!env) {
      throw new Error(`[tanstack-start] unknown Rsbuild environment "${name}"`)
    }
    return env
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
   * The import rewrite of an environment: the file a request with inline
   * loaders loads (`!!raw-loader!./x.ts`, `-!./x.ts`: its last segment,
   * whatever loaders run on it), and `source.transformImport`.
   */
  private importRewrite(env: EnvState): ImportRewrite {
    const rules = env.transformImport
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
   * The host services of the compiles and invalidations of an environment's
   * modules of `layer`: their own resolver (aliases and conditions differ by
   * environment; the RSC layer's rules add `RSBUILD_RSC_LAYER_RESOLVE`).
   */
  private hostFor(envName: string, layer: string | undefined): HostServices {
    const scope =
      layer !== undefined && layer === this.rscLayer ? layer : undefined
    const options = scope === undefined ? undefined : RSBUILD_RSC_LAYER_RESOLVE
    const key = scope === undefined ? envName : `${envName}\0${scope}`
    let host = this.hosts.get(key)
    if (!host) {
      const resolve = this.resolvers.get(envName)
      if (!resolve) {
        throw new Error(
          `[tanstack-start] no resolver for the Rsbuild environment "${envName}"`,
        )
      }
      host = this.start.host(
        async (specifier, importer) => {
          const id = await resolve(
            path.dirname(identify(importer).path),
            specifier,
            options,
          )
          return id === null ? null : { id }
        },
        { importRewrite: this.importRewrite(this.env(envName)) },
      )
      if (scope !== undefined) {
        host.resolveScope = scope
      }
      this.hosts.set(key, host)
    }
    return host
  }

  /** The host of a plan's module (its layer: the one the plan's configuration is of; the RSC layer is the server environment's). */
  private hostOfPlan(key: PlanKey): HostServices {
    const layer =
      this.rscLayer !== undefined &&
      key.env === RSBUILD_ENVIRONMENT_NAMES.server &&
      this.start.configured(key.configKey, this.env(key.env), this.rscLayer)
        ? this.rscLayer
        : undefined
    return this.hostFor(key.env, layer)
  }

  /** What each environment's last compilation depended on (its file events; dev: `retain`). */
  readonly files = new CompilationFiles()

  /**
   * After an environment's dev compilation (`files` recorded its
   * dependencies): forget what the session holds of
   * files the compilation no longer depends on (plans, raw facts, import
   * protection's importer records). Rspack reports a deleted file only while a module depends on it,
   * so a module the app stopped importing and then deleted never gets its
   * `unlink`; without this its state stayed for the session (every cache
   * must stay bounded by the live modules). Called only when the files
   * changed (not on an edit).
   */
  retain(envName: string): void {
    const live = this.files.of(envName)
    const isFile = (path: string) =>
      path.startsWith('/') || /^[A-Za-z]:\//.test(path)
    const keepIn =
      (set: (path: string) => boolean) =>
      (path: string): boolean =>
        !isFile(path) || path.includes('/node_modules/.virtual/') || set(path)
    const keepEnv = keepIn((p) => live.has(p))
    const plans = this.start.caches.plans.get(envName)
    if (plans) {
      for (const key of plans.keys()) {
        if (!keepEnv(identify(key.canonicalId).path)) {
          plans.delete(key)
        }
      }
    }
    this.start.ip?.retain(keepEnv, envName)
    if (this.files.size === this.envs.size) {
      // shared state: kept while any environment depends on the file
      const anyEnv = keepIn((p) => this.files.known(p))
      this.start.rawFacts.retain((id) => anyEnv(identify(id).path))
      this.start.ip?.retain(anyEnv)
    }
  }

  /**
   * After the last pass of an environment's production build: releases
   * its plans and its import protection. What the environments share
   * (raw facts, registry, id allocator, warnings) stays.
   */
  release(envName: string): void {
    this.start.release(envName)
    this.files.forget(envName)
    const env = this.envs.get(envName)
    if (env) {
      env.compiled = new Set()
    }
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
   * The file events of a compilation that starts: each environment compiler
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
   * The compiler of an environment, for the stale-set drain. Under RSC,
   * Rspack's coordinator starts each client compilation from a server
   * compilation: the client's stale set gets the server compiler a
   * compilation.
   */
  registerCompiler(envName: string, compiler: IdleCompilerLike): void {
    this.drain.register(
      envName,
      compiler,
      this.rscLayer !== undefined &&
        envName === RSBUILD_ENVIRONMENT_NAMES.client
        ? RSBUILD_ENVIRONMENT_NAMES.server
        : undefined,
    )
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

  /** The files the plans of an environment's modules at `paths` read, but the modules' own (`planDependencyFiles`). */
  dependencyFiles(envName: string, paths: ReadonlySet<string>): Array<string> {
    return [...planDependencyFiles(this.start.caches, envName, paths)].filter(
      (file) => !paths.has(file) && path.isAbsolute(file),
    )
  }

  /**
   * The plans an earlier process persisted with an environment's modules
   * (`PLAN_BUILD_INFO_FIELD`), which Rspack's persistent cache restored
   * without a compile: each one compiled with this session's configuration
   * and whose dependencies are all current joins the session's plans
   * (`restorePlans`); the files of the others enter the environment's stale
   * set (built again by the drain that follows).
   */
  async restorePlans(
    envName: string,
    modules: Iterable<{ plan: PersistedPlan; layer: string | undefined }>,
  ): Promise<void> {
    const env = this.env(envName)
    const current = new Map<string, PersistedPlan>()
    const stale: Array<PlanKey> = []
    for (const { plan, layer } of modules) {
      if (this.start.configured(plan.key.configKey, env, layer)) {
        current.set(planKeyString(plan.key), plan)
      } else {
        stale.push(plan.key)
      }
    }
    stale.push(
      ...(await restorePlans(this.start.caches, current.values(), (key) =>
        this.hostOfPlan(key),
      )),
    )
    for (const file of pathsOf(stale)) {
      this.start.caches.stale.add(envName, file)
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
    const env = this.env(options.environment)
    const passthrough: LoaderResult = { code: bytes, map: inputMap }
    const { ip } = this.start
    if (options.pass === 'edge') {
      // the bundler requested this edge module from the importer's post-SWC
      // code: `allowImport` decides between the real module and the mock
      const ipEnv = ip?.env(env.name, env.type)
      env.compiled.add(ctx.resource)
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
        layer: ctx._module?.layer ?? undefined,
        inputMap: readInputMap,
        wantMap: ctx.sourceMap !== false,
        // webpack-sources counts the map's lines at LF only
        lines: 'lf',
        late,
      },
      this.hostFor(env.name, ctx._module?.layer ?? undefined),
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
    if (env.persistsModules && out.persisted && buildInfo) {
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
        env.recordMapText,
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
    env.compiled.add(ctx.resource)
    const outcome = this.start.afterCompile(env, id, out)
    const { error, mock } = outcome instanceof Promise ? await outcome : outcome
    if (error) {
      throwLocated(ctx, error as DevViolationError)
    }
    const buildInfo = ctx._module?.buildInfo
    const ipEnv = this.start.ip?.env(env.name, env.type)
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
   * The resolver module of an environment: the registry's manifest, gated
   * to client-referenced entries in production builds whose SSR
   * environment is the provider (J4.2); in development every entry, with a
   * warning for a client call of a function no client module references
   * (the client compilation's replay rewrites the resolver, so the flags
   * follow the client graph). The RSC provider lists its environment's
   * functions (the RSC build order).
   */
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
        opts.mode === 'build' && opts.rsc !== undefined
          ? JSON.stringify(CLIENT_REFERENCED_IDS_PLACEHOLDER)
          : undefined,
    })
  }

  /**
   * The JSON array of client-referenced function ids (the gate's set, J4.2):
   * final ids, also with a custom generator (the gate is filled in after
   * the ids were patched, so its placeholders resolve here).
   */
  clientReferencedIdsLiteral(): string {
    const allocator =
      this.start.allocator && this.start.allocateIds('client').allocator
    return JSON.stringify(
      this.start.registry
        .entries()
        .filter((e) => e.clientReferenced)
        .map((e) => (allocator ? allocator.patch(e.id).code : e.id))
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
 * What each environment's last compilation depended on (`fileDependencies`,
 * `contextDependencies`), normalized: tells a modified file's event. A file
 * no environment's last compilation knows was created (an `add`: it may take
 * resolutions that failed before); one any environment's knows was edited:
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
