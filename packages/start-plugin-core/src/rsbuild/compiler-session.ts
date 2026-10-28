/**
 * Start's Rspack host of the compiler core on Rsbuild (see the core's
 * README.md, "Hosts"): one compile per (environment, layer, module)
 * running every planner — `start-env`, `hydrate`, `rsc-css` (the RSC
 * layer), `route-split`/`route-hmr` (client), `import-edges` — from one
 * `pre` loader per environment (`compiler-loader.ts`), the shared caches,
 * the server-fn registry rebuilt from the compilers' `buildInfo`, and the
 * one invalidation operation on `watchRun`. The Rspack hooks live in
 * `host-plugin.ts`; this module is bundler-API free except for the loader
 * context shape.
 */
import fs from 'node:fs'
import path from 'node:path'
import remapping from '@jridgewell/remapping'
import {
  RawFactsCache,
  SourceText,
  WarningLedger,
  collectionSizes,
  compileModule,
  createCompilerCaches,
  deriveId,
  digestOf,
  identify,
  invalidate,
  registerCompilerStats,
  releaseEnvironment,
} from '@tanstack/router-utils/compiler'
import { defaultCodeSplitGroupings } from '@tanstack/router-plugin'
import {
  routerPlannerConfig,
  routerPlanners,
} from '@tanstack/router-plugin/planners'
import { namesStartSpecifier, startRecognizer } from '../compiler/recognizer'
import { startCompileScope } from '../compiler/scope'
import { START_ENV, startPlanners } from '../planners'
import { HYDRATE_PLANNER, createHydratePlanner } from '../planners/hydrate'
import { RSC_CSS } from '../planners/rsc-css'
import { FunctionIdAllocator } from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import {
  CLIENT_REFERENCED_IDS_PLACEHOLDER,
  manifestResolverModule,
} from '../server-fns/resolver'
import { createImportProtection } from '../import-protection/session'
import { rspackEdgeModuleIds } from '../import-protection/edge-modules'
import { violationsOf } from '../import-protection/violations'
import { normalizePath } from '../utils'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { ImportProtection } from '../import-protection/session'
import type { ImportRewrite } from '../planners/edges'
import type { HydratePlannerConfig } from '../planners/hydrate'
import type { RscCssConfig, StartEnvConfig, StartEnvFacts } from '../planners'
import type { ServerFnEntry, ServerFnFact } from '../server-fns/registry'
import type { GenerateFunctionId } from '../server-fns/ids'
import type { ImportProtectionOptions } from '../schema'
import type { CompileStartFrameworkOptions, StartRscOptions } from '../types'
import type { Config as RouterConfig } from '@tanstack/router-plugin'
import type { RouterPlannerConfig } from '@tanstack/router-plugin/planners'
import type {
  CompileOutput,
  CompilerCaches,
  Diagnostic,
  EnvInfo,
  HostServices,
  InputSourceMap,
  InvalidateChange,
  PlanKey,
  Planner,
  RawSourceMap,
} from '@tanstack/router-utils/compiler'

/** The `buildInfo` field holding a module's server-fn facts (persisted by Rspack's cache; replayed at `finishMake`). */
export const SERVER_FN_BUILD_INFO_FIELD = 'tanstack.start.serverFns'

export interface ServerFnBuildInfo {
  version: 2
  canonicalId: string
  envType: 'client' | 'server'
  facts: Array<ServerFnFact>
}

export interface StartRsbuildEnvironment {
  name: string
  type: 'client' | 'server'
}

/** Rsbuild `source.transformImport` entries (the array form) the host predicts, so the file and
 * marker rules judge the rewritten import's target. */
export interface TransformImportRule {
  libraryName: string
  libraryDirectory?: string
  customName?: string | ((member: string) => string | undefined)
  camelToDashComponentName?: boolean
  transformToDefaultImport?: boolean
  ignoreEsComponent?: Array<string>
}

export interface StartRsbuildSessionOptions {
  framework: CompileStartFrameworkOptions
  /** From the Rsbuild action (never `process.env.NODE_ENV`). */
  mode: 'dev' | 'build'
  root: () => string
  srcDirectory: () => string
  environments: Array<StartRsbuildEnvironment>
  ssrIsProvider: boolean
  rsc: StartRscOptions | undefined
  /** The Rspack layer running the RSC render (RSC on). */
  rscLayer: string | undefined
  generateFunctionId?: GenerateFunctionId | undefined
  routerConfig: () => RouterConfig
  importProtection: () => ImportProtectionOptions | undefined
  /** The route registry (the generator's `routesByFile`). */
  routes: { lookup: (path: string) => { routeId: string } | null }
  /** tsconfig `verbatimModuleSyntax` (TypeScript keeps unused imports). */
  verbatimModuleSyntax?: boolean
  /** Whether a path is an app entry (a marked entry is its own import-protection violation). */
  isEntry: (path: string) => boolean
}

/** What the loader implementation uses of Rspack's loader context. */
export interface LoaderContextLike {
  resource: string
  resourcePath: string
  sourceMap?: boolean
  addDependency: (file: string) => void
  emitWarning: (error: Error) => void
  getResolve: (
    options?: object,
  ) => (context: string, request: string) => Promise<string | false | undefined>
  _module?: { buildInfo?: Record<string, unknown>; layer?: string | null }
}

export interface LoaderResult {
  code: string
  map: unknown
}

export interface LoaderOptions {
  environment: string
  /** `late`: the J6-only pass over the JS output of a non-JS module
   * (`.vue`, `.mdx`: Tier 0 only, with a host-supplied language). */
  pass?: 'late'
}

export interface EnvState {
  name: string
  type: 'client' | 'server'
  /** The server-fn facts of this environment's modules, by module resource (the compiler's snapshot). */
  serverFns: Map<string, ServerFnBuildInfo>
  transformImport: Array<TransformImportRule>
  /** The resources the loader compiled in the current compilation (host: cleared at `thisCompilation`). */
  compiled: Set<string>
  /** The plan fingerprint of the last compile of each resource (a repeat is a cache hit). */
  fingerprints: Map<string, string>
}

/** The session every compiler of one Rsbuild plugin shares. */
export class StartRsbuildCompilerSession {
  readonly caches: CompilerCaches
  readonly rawFacts: RawFactsCache
  readonly registry = new ServerFnRegistry()
  readonly warnings = new WarningLedger(() => {})
  readonly allocator: FunctionIdAllocator | null
  readonly envs = new Map<string, EnvState>()
  /** Readers of files through the compilers' input file systems (virtual modules included), by environment. */
  readonly inputFileSystems = new Map<
    string,
    (file: string) => Promise<string | null>
  >()
  /** A resolver per environment for the invalidation operation (outside any loader). */
  readonly resolvers = new Map<
    string,
    (importerDir: string, specifier: string) => Promise<string | null>
  >()
  /** Import protection of the session (null: `enabled: false`). */
  readonly ip: ImportProtection | null
  /** Whether a module is compiled (`startCompileScope`). */
  private readonly compiles: (path: string, code: string) => boolean
  private readonly plannersByKey = new Map<string, Array<Planner>>()
  private readonly routerCfg = new Map<
    'client' | 'server',
    RouterPlannerConfig
  >()

  constructor(readonly opts: StartRsbuildSessionOptions) {
    this.allocator = opts.generateFunctionId
      ? new FunctionIdAllocator(opts.generateFunctionId)
      : null
    for (const env of opts.environments) {
      this.envs.set(env.name, {
        name: env.name,
        type: env.type,
        serverFns: new Map(),
        transformImport: [],
        compiled: new Set(),
        fingerprints: new Map(),
      })
    }
    const root = opts.root()
    this.ip = createImportProtection({
      options: opts.importProtection(),
      root,
      srcDirectory: opts.srcDirectory(),
      mode: opts.mode,
      ids: rspackEdgeModuleIds(
        `${normalizePath(root)}/node_modules/.virtual/tanstack-start/import-protection`,
      ),
      verbatimModuleSyntax: opts.verbatimModuleSyntax,
      readFile: (file) => this.readFile(file),
      isEntry: opts.isEntry,
    })
    for (const env of opts.environments) {
      this.ip?.env(env.name, env.type)
    }
    this.compiles = startCompileScope(this.ip)
    this.rawFacts = new RawFactsCache({
      readFile: (file) => this.readFile(file),
      loadVirtual: () => Promise.resolve(null),
      recognizer: startRecognizer(),
      // every analysis of the session agrees on the marker specifiers
      markerSpecifiers: this.ip?.markerSpecifiers,
    })
    this.caches = createCompilerCaches(this.rawFacts, 'start:rsbuild')
    registerCompilerStats('start:rsbuild:session', this, (o) =>
      collectionSizes(
        {
          envs: o.envs,
          registry: o.registry,
          warnings: o.warnings,
          ip: o.ip,
          missing: o.missing,
        },
        4,
      ),
    )
  }

  env(name: string): EnvState {
    const env = this.envs.get(name)
    if (!env) {
      throw new Error(`[tanstack-start] unknown Rsbuild environment "${name}"`)
    }
    return env
  }

  /**
   * Reads a file: our virtual modules through the compilers' input file
   * systems (Rspack's virtual files), real files from the disk (the input
   * file system caches across a watch compilation; the disk is the truth
   * of an edited dependency).
   */
  async readFile(file: string): Promise<string | null> {
    if (file.includes('/node_modules/.virtual/')) {
      for (const read of this.inputFileSystems.values()) {
        const text = await read(file)
        if (text !== null) {
          return text
        }
      }
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

  /**
   * Drops every missing-file fact and lets the compiles of the starting
   * watch compilation re-resolve recorded resolutions once (the file set
   * may have changed without an event: `fileSetVersion`).
   */
  forgetMisses(): void {
    this.caches.fileSetVersion++
    for (const file of this.missing) {
      this.rawFacts.markStale(file)
    }
    this.missing.clear()
  }

  /**
   * The router planners' configuration of an environment type: the client
   * splits with route HMR and without the server-only options; a server
   * environment splits too (the same component nesting as the client, which
   * Solid's hydration keys need; as the Vite path), without HMR.
   */
  private routerPlannerConfig(type: 'client' | 'server'): RouterPlannerConfig {
    let cfg = this.routerCfg.get(type)
    if (!cfg) {
      const cs = this.opts.routerConfig().codeSplittingOptions
      cfg = {
        framework: this.opts.framework,
        split: true,
        defaultGroupings: cs?.defaultBehavior ?? defaultCodeSplitGroupings,
        splitBehavior: cs?.splitBehavior,
        deleteNodes: type === 'client' ? ['ssr', 'server', 'headers'] : [],
        hmr: {
          enabled: type === 'client' && (cs?.addHmr ?? true),
          style: 'webpack',
        },
      }
      this.routerCfg.set(type, cfg)
    }
    return cfg
  }

  private plannersFor(env: EnvState, rscLayer: boolean): Array<Planner> {
    const key = `${env.name}\u0000${rscLayer ? 'rsc' : ''}`
    let planners = this.plannersByKey.get(key)
    if (!planners) {
      planners = startPlanners({
        hydrate: createHydratePlanner(),
        rscCss: rscLayer,
        router: routerPlanners(),
        importEdges: this.ip?.planner ?? null,
      })
      this.plannersByKey.set(key, planners)
    }
    return planners
  }

  envInfo(env: EnvState, layer: string | undefined): EnvInfo {
    return {
      name: env.name,
      type: env.type,
      isProvider: env.name === RSBUILD_ENVIRONMENT_NAMES.server,
      mode: this.opts.mode,
      bundler: 'rspack',
      framework: this.opts.framework,
      conditions: [],
      routerSplit: true,
      ...(layer ? { layer } : {}),
    }
  }

  private configFor(
    env: EnvState,
    rscLayer: boolean,
    layer: string | undefined,
  ) {
    const { opts } = this
    const root = opts.root()
    const idMode: StartEnvConfig['idMode'] =
      opts.mode === 'dev' ? 'dev' : this.allocator ? 'placeholder' : 'default'
    const startEnv: StartEnvConfig = {
      framework: opts.framework,
      root,
      providerSeparate: !opts.ssrIsProvider,
      idMode,
      providerDirective: opts.rsc?.providerDirective,
      alwaysDeriveProvider: opts.rsc !== undefined,
    }
    const router = this.routerPlannerConfig(env.type)
    const hydrate: HydratePlannerConfig = {
      root,
      refreshMarkers:
        opts.mode === 'dev' &&
        env.type === 'client' &&
        opts.framework === 'react' &&
        router.hmr.enabled,
    }
    const rscCss: RscCssConfig | undefined =
      rscLayer && opts.rsc
        ? { loadCssExpression: opts.rsc.loadCssExpression }
        : undefined
    const ipKey = this.ip?.config.configKey ?? null
    return {
      configKey: digestOf({
        bundler: 'rspack',
        mode: opts.mode,
        framework: opts.framework,
        root,
        ssrIsProvider: opts.ssrIsProvider,
        idMode,
        rsc: opts.rsc ?? null,
        env: env.name,
        layer: layer ?? null,
        router: {
          split: router.split,
          groupings: router.defaultGroupings,
          splitBehavior: router.splitBehavior?.toString() ?? null,
          deleteNodes: [...router.deleteNodes],
          hmr: router.hmr,
        },
        ip: ipKey,
      }),
      perPlanner: {
        [START_ENV]: startEnv,
        [HYDRATE_PLANNER]: hydrate,
        [RSC_CSS]: rscCss,
        ...routerPlannerConfig(router),
      } as Record<string, unknown>,
    }
  }

  /** The import rewrite of an environment (`source.transformImport`), when it has one. */
  private importRewrite(env: EnvState): ImportRewrite | undefined {
    const rules = env.transformImport
    if (rules.length === 0) {
      return undefined
    }
    return (specifier, names) => {
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

  /** Host services of one compile, bound to a loader context's resolver. */
  private hostFor(ctx: LoaderContextLike, env: EnvState): HostServices {
    const resolver = ctx.getResolve()
    return {
      resolve: async (specifier, importer) => {
        try {
          const dir = path.dirname(identify(importer).path)
          const r = await resolver(dir, specifier)
          return typeof r === 'string' ? { id: normalizePath(r) } : null
        } catch {
          return null
        }
      },
      readFile: (file) => this.readFile(file),
      loadVirtual: () => Promise.resolve(null),
      rawFacts: this.rawFacts,
      warnings: this.warnings,
      routes: { digestFor: (p) => this.routeDigest(p) },
      services: {
        routes: { lookup: (p: string) => this.opts.routes.lookup(p) },
        importRewrite: this.importRewrite(env),
      },
    }
  }

  private routeDigest(p: string): string | null {
    const entry = this.opts.routes.lookup(p)
    return entry ? digestOf({ routeId: entry.routeId }) : null
  }

  /**
   * The host of the invalidation operation for an environment: its own
   * resolver (per-environment aliases and conditions); an environment
   * without a registered resolver yet asks the others in turn.
   */
  private invalidationHost(env?: string): HostServices {
    const own = env === undefined ? undefined : this.resolvers.get(env)
    const resolvers = own ? [own] : [...this.resolvers.values()]
    return {
      resolve: async (specifier, importer) => {
        const dir = path.dirname(identify(importer).path)
        for (const resolve of resolvers) {
          const id = await resolve(dir, specifier)
          if (id !== null) {
            return { id }
          }
        }
        return null
      },
      readFile: (file) => this.readFile(file),
      loadVirtual: () => Promise.resolve(null),
      rawFacts: this.rawFacts,
      warnings: this.warnings,
      routes: { digestFor: (p) => this.routeDigest(p) },
    }
  }

  /** Per environment: the files its last compilation depended on (dev; see `retain`). */
  private readonly liveFiles = new Map<string, ReadonlySet<string>>()

  /**
   * After an environment's dev compilation: forget what the session holds of
   * files the compilation no longer depends on (plans, raw facts, import
   * protection's importer records, the per-resource fingerprints and server-fn
   * records). Rspack reports a deleted file only while a module depends on it,
   * so a module the app stopped importing and then deleted never gets its
   * `unlink`; without this its state stayed for the session (every cache
   * must stay bounded by the live modules).
   */
  retain(envName: string, files: Iterable<string>): void {
    const live = new Set<string>()
    for (const f of files) {
      live.add(normalizePath(f))
    }
    this.liveFiles.set(envName, live)
    const isFile = (path: string) =>
      path.startsWith('/') || /^[A-Za-z]:\//.test(path)
    const keepIn =
      (set: (path: string) => boolean) =>
      (path: string): boolean =>
        !isFile(path) || path.includes('/node_modules/.virtual/') || set(path)
    const keepEnv = keepIn((p) => live.has(p))
    const plans = this.caches.plans.get(envName)
    if (plans) {
      for (const entry of [...plans.values()]) {
        if (!keepEnv(identify(entry.key.canonicalId).path)) {
          plans.delete(entry.key)
        }
      }
    }
    const env = this.envs.get(envName)
    if (env) {
      for (const map of [env.fingerprints, env.serverFns]) {
        for (const resource of [...map.keys()]) {
          if (!keepEnv(identify(canonicalResource(resource)).path)) {
            map.delete(resource)
          }
        }
      }
    }
    this.ip?.retain(keepEnv, envName)
    if (this.liveFiles.size === this.envs.size) {
      // shared state: kept while any environment depends on the file
      const anyEnv = keepIn((p) =>
        [...this.liveFiles.values()].some((set) => set.has(p)),
      )
      this.rawFacts.retain((id) => anyEnv(identify(id).path))
      this.ip?.retain(anyEnv)
    }
  }

  /**
   * After the last pass of an environment's production build: releases
   * its plans, its import protection and its per-resource fingerprints.
   * Its server-fn snapshot stays (the registry is rebuilt from every
   * environment's snapshot), and so does what the environments share (raw
   * facts, registry, id allocator, warnings).
   */
  release(envName: string): void {
    releaseEnvironment(this.caches, envName)
    this.ip?.release(envName)
    const env = this.envs.get(envName)
    if (env) {
      env.fingerprints = new Map()
      env.compiled = new Set()
    }
  }

  /** The one invalidation operation (compiler plans and bundler transforms together): the host's bundler rebuilds through the loader's `addDependency` set. */
  invalidate(
    file: string,
    kind: InvalidateChange['kind'],
  ): Promise<{ evicted: Array<PlanKey>; dependents: Array<PlanKey> }> {
    return invalidate(this.caches, { path: normalizePath(file), kind }, (env) =>
      this.invalidationHost(env),
    )
  }

  /**
   * The loader implementation: compiles every id (env and derived) of a
   * JS/TS module of an environment from the text Rspack hands it (never
   * from a path-only "latest plan", so upstream loaders and maps compose),
   * composes maps with the input map, records dependencies, server-fn
   * facts and import-protection records, and reports diagnostics.
   */
  async compile(
    ctx: LoaderContextLike,
    source: string,
    inputMap: unknown,
    options: LoaderOptions,
  ): Promise<LoaderResult> {
    const env = this.env(options.environment)
    const passthrough: LoaderResult = { code: source, map: inputMap }
    const id = canonicalResource(ctx.resource)
    const identity = identify(id)
    const late = options.pass === 'late'
    if (late ? identity.lang !== null : identity.lang === null) {
      return passthrough
    }
    const ip = this.ip
    if (late && !ip) {
      return passthrough
    }
    if (!late && !this.compiles(identity.path, source)) {
      return passthrough
    }
    const layer = ctx._module?.layer ?? undefined
    const rscLayer =
      this.opts.rscLayer !== undefined && layer === this.opts.rscLayer
    // the RSC layer renders server components: its route modules (the providers' twins of
    // the SSR route modules) stay unsplit, so the router's lazy wrapper (a React hook in
    // development) never resolves against the react-server build of React
    const routerSplit = !rscLayer
    const envInfo = { ...this.envInfo(env, layer), routerSplit }
    const config = this.configFor(env, rscLayer, layer)
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
    const out = await compileModule(
      {
        id,
        code: source,
        env: envInfo,
        planners: late ? [ip!.planner] : this.plannersFor(env, rscLayer),
        config: late
          ? { configKey: `late\u0000${config.configKey}`, perPlanner: {} }
          : config,
        wantMap: ctx.sourceMap !== false,
        inputMap: readInputMap,
        ...(late ? { lang: 'jsx' as const } : {}),
      },
      this.hostFor(ctx, env),
      this.caches,
    )
    if (!out) {
      return passthrough
    }
    for (const dep of out.dependencies) {
      if (dep !== identity.path) {
        ctx.addDependency(dep)
      }
    }
    this.reportDiagnostics(ctx, out, identity.path, source, env.type)
    const ipEnv = ip?.env(env.name, env.type)
    env.compiled.add(ctx.resource)
    if (ipEnv) {
      // registers the edges and, in development, reports the violations of
      // this compile once
      const { error } = ipEnv.afterCompile(id, out)
      if (error) {
        throw error
      }
      // dev `log: 'always'`: a compile the plan cache answered (the same plan
      // again: an importer Rspack rebuilt for a dependency's edit) asks
      // `onViolation` again, like every compile; printed above, not twice
      if (
        this.opts.mode === 'dev' &&
        ip!.config.log === 'always' &&
        env.fingerprints.get(ctx.resource) === out.fingerprint
      ) {
        await ipEnv.reportAgain(
          id,
          { version: 1, env: env.name, violations: violationsOf(out) },
          { enqueue: false },
        )
      }
      env.fingerprints.set(ctx.resource, out.fingerprint)
    }
    const buildInfo = ctx._module?.buildInfo
    if (!late) {
      const facts = out.facts.planners[START_ENV] as StartEnvFacts | undefined
      if (facts && facts.serverFns.length > 0) {
        const record: ServerFnBuildInfo = {
          version: 2,
          canonicalId: identity.canonicalId,
          envType: env.type,
          facts: facts.serverFns,
        }
        env.serverFns.set(ctx.resource, record)
        this.registry.record(identity.canonicalId, facts.serverFns, env.type)
        if (buildInfo) {
          buildInfo[SERVER_FN_BUILD_INFO_FIELD] = record
        }
      }
    }
    if (ipEnv && buildInfo) {
      const info = ipEnv.buildInfo(id, out)
      if (info) {
        buildInfo[info.key] = info.value
      }
    }
    if (identity.derived === null && out.code === source) {
      return passthrough
    }
    return { code: out.code, map: this.composeMap(ctx, out.map, inputMap) }
  }

  private composeMap(
    ctx: LoaderContextLike,
    map: RawSourceMap | null,
    inputMap: unknown,
  ): unknown {
    if (!map) {
      return undefined
    }
    const ours = { ...map, sources: [ctx.resourcePath] }
    if (!inputMap) {
      return ours
    }
    const input =
      typeof inputMap === 'string'
        ? (JSON.parse(inputMap) as Parameters<typeof remapping>[0])
        : (inputMap as Parameters<typeof remapping>[0])
    const composed = remapping(
      [ours as unknown as Parameters<typeof remapping>[0], input] as never,
      () => null,
    )
    return JSON.parse(composed.toString())
  }

  /** Errors fail the module (positioned, 1-based line and column); warnings once per (file, reason) per run. */
  private reportDiagnostics(
    ctx: LoaderContextLike,
    out: CompileOutput,
    file: string,
    code: string,
    envType: 'client' | 'server',
  ): void {
    if (out.diagnostics.length === 0) {
      return
    }
    let text: SourceText | null = null
    // the position in the Vite host's form, `message (file:line:col)`
    const where = (d: Diagnostic): string => {
      if (!d.range) {
        return ''
      }
      text ??= new SourceText(code)
      const at = text.locate(d.range.start)
      return ` (${file}:${at.line + 1}:${at.column + 1})`
    }
    const errors: Array<string> = []
    for (const d of out.diagnostics) {
      if (d.by === 'parse') {
        // a module naming no Start package is left as it is (the bundler's
        // own parser reports the error at the user's position); one that
        // names a Start package may define server code: the client build
        // fails naming the file (never shipped untransformed, J4.12), a
        // server build warns once (as the Vite host)
        if (!namesStartSpecifier(code)) {
          continue
        }
        const message = `[tanstack-start] The compiler cannot parse "${file}", which uses a TanStack Start or Router API, so it cannot compile its server code: ${d.message}${where(d)}`
        if (envType === 'client') {
          errors.push(message)
        } else if (this.warnings.once(file, { ...d, code: 'parse' })) {
          const warning = new Error(message)
          warning.name = 'TanStackStartCompilerWarning'
          ctx.emitWarning(warning)
        }
        continue
      }
      if (d.severity === 'error') {
        errors.push(`${d.message}${where(d)}`)
      } else if (this.warnings.once(file, d)) {
        const warning = new Error(`${d.message}${where(d)}`)
        warning.name = 'TanStackStartCompilerWarning'
        ctx.emitWarning(warning)
      }
    }
    if (errors.length > 0) {
      const error = new Error(errors.join('\n'))
      error.name = 'TanStackStartCompilerError'
      throw error
    }
  }

  /** Rebuilds the registry from every environment's snapshot (the `finishMake` replay, persistent cache included). */
  rebuildRegistry(): void {
    this.registry.clear()
    for (const env of this.envs.values()) {
      for (const record of env.serverFns.values()) {
        this.registry.record(record.canonicalId, record.facts, record.envType)
      }
    }
  }

  /** The module an entry's `createServerRpc` wrapper is exported from. */
  providerModuleId(entry: ServerFnEntry): string {
    return entry.providerDerived
      ? deriveId(entry.definingCanonicalId, { kind: 'provider', value: '' })
      : entry.definingCanonicalId
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
    const { opts } = this
    return manifestResolverModule({
      entries: this.registry.entries(),
      providerModuleId: (e) => this.providerModuleId(e),
      clientReferencedOnly: opts.mode === 'build' && opts.ssrIsProvider,
      warnUnreferenced: opts.mode === 'dev' && opts.ssrIsProvider,
      staticImports: opts.rsc !== undefined && opts.mode === 'dev',
      memoizeModules: opts.mode === 'build',
      // RSC build (J4.2): the RSC coordinator interleaves the server and client
      // compilations, so the manifest is generated before the client's
      // references are known; it lists every function (server-origin calls
      // reach the provider through it) and gates client-origin calls on a
      // set the server asset pipeline fills in once the client build exists
      clientOriginGate:
        opts.mode === 'build' && !opts.ssrIsProvider
          ? JSON.stringify(CLIENT_REFERENCED_IDS_PLACEHOLDER)
          : undefined,
    })
  }

  /** The JSON array of client-referenced function ids (the gate's set, J4.2). */
  clientReferencedIdsLiteral(): string {
    return JSON.stringify(
      this.registry
        .entries()
        .filter((e) => e.clientReferenced)
        .map((e) => e.id)
        .sort(),
    )
  }

  /** The entries of a rank for the custom-id allocation: client-referenced first, the rest after. */
  allocateIds(envType: 'client' | 'server'): FunctionIdAllocator | null {
    const allocator = this.allocator
    if (!allocator) {
      return null
    }
    const entries = this.registry.entries()
    allocator.allocate(
      envType === 'client'
        ? entries.filter((e) => e.clientReferenced)
        : entries,
    )
    return allocator
  }
}

/**
 * A module resource as a compiler id. Rspack's RSC plugin requests a
 * `'use server-entry'` module's original content under its own query,
 * appended with a second `?` (`file?tss-serverfn-split?rsc-server-entry-proxy=true`):
 * the identity parser reads one query, so later `?` become `&`, and that
 * query names no other source (the same text, the same plan: the server fn
 * registry must point the resolver at `file?tss-serverfn-split`), so it is
 * dropped.
 */
export function canonicalResource(resource: string): string {
  // Rspack and webpack escape a `#` of the file path in `resource` (`\u200b#`
  // and `\0#`; `resourcePath` is unescaped): a project path with a `#` (`C#`,
  // `project #2`) must give the file's path
  const normalized = normalizePath(resource.replace(/[\0\u200b]#/g, '#'))
  const q = normalized.indexOf('?')
  if (q === -1) {
    return normalized
  }
  const query = normalized
    .slice(q + 1)
    .replace(/\?/g, '&')
    .split('&')
    .filter((part) => part !== '' && !part.startsWith(RSC_PROXY_QUERY))
    .join('&')
  return query.length > 0
    ? `${normalized.slice(0, q)}?${query}`
    : normalized.slice(0, q)
}

/** Rspack's RSC plugin's query on a server entry's original module. */
const RSC_PROXY_QUERY = 'rsc-server-entry-proxy'

const camelToDash = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/** The specifier Rsbuild's `source.transformImport` turns a member import into (its documented defaults). */
export function rewrittenSpecifier(
  rule: TransformImportRule,
  member: string,
): string {
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
