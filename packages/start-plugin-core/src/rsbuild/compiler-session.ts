/**
 * Start's Rspack host of the compiler core on Rsbuild (DESIGN §4.2; D8,
 * R3, R11, R30, R35, R46): one compile per (environment, layer, module)
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
  compileModule,
  createCompilerCaches,
  deriveId,
  digestOf,
  identify,
  invalidate,
} from '@tanstack/router-utils/compiler'
import { defaultCodeSplitGroupings } from '@tanstack/router-plugin'
import {
  routerPlannerConfig,
  routerPlanners,
} from '@tanstack/router-plugin/planners'
import { startRecognizer } from '../compiler/recognizer'
import { START_ENV, startPlanners } from '../planners'
import { HYDRATE_PLANNER, createHydratePlanner } from '../planners/hydrate'
import { RSC_CSS } from '../planners/rsc-css'
import { FunctionIdAllocator } from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import { manifestResolverModule } from '../server-fns/resolver'
import { createImportProtection } from '../import-protection/session'
import { violationsOf } from '../import-protection/violations'
import { rspackEdgeModuleIds } from '../import-protection/edge-modules'
import { normalizePath } from '../utils'
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

/** Rsbuild `source.transformImport` entries (the array form) the host predicts for R46. */
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
  providerEnvName: string
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
  /** `late`: the J6-only pass over the JS output of a non-JS module (R48). */
  pass?: 'late'
}

const NODE_MODULES_RE = /[\\/]node_modules[\\/]/
/**
 * The cheap text gate of a dependency module (not an importer import
 * protection checks): a module naming no Start, router or RSC API and no
 * builder step cannot need a plan, so it is not parsed (D14; the Start
 * libraries an app depends on name them).
 */
const START_TEXT_RE =
  /createServerFn|createMiddleware|createIsomorphicFn|createServerOnlyFn|createClientOnlyFn|createStart|ClientOnly|Hydrate|createFileRoute|createRootRoute|createLazyFileRoute|\.handler\(|\.server\(|\.client\(|renderServerComponent|createCompositeComponent|renderToReadableStream/

export interface EnvState {
  name: string
  type: 'client' | 'server'
  /** The server-fn facts of this environment's modules, by module resource (the compiler's snapshot). */
  serverFns: Map<string, ServerFnBuildInfo>
  transformImport: Array<TransformImportRule>
  /** The resources the loader compiled in the current compilation (host: cleared at `thisCompilation`). */
  compiled: Set<string>
  /** The plan fingerprint of the last compile of each resource (a repeat is a cache hit). */
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
    this.rawFacts = new RawFactsCache({
      readFile: (file) => this.readFile(file),
      loadVirtual: () => Promise.resolve(null),
      recognizer: startRecognizer(),
      // every analysis of the session agrees on the marker specifiers
      markerSpecifiers: this.ip?.markerSpecifiers,
    })
    this.caches = createCompilerCaches(this.rawFacts)
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

  /** Drops every failed resolution and missing-file fact (a watch compilation starts). */
  forgetMisses(): void {
    for (const m of this.caches.resolutions.values()) {
      for (const [key, value] of m) {
        if (value === null) {
          m.delete(key)
        }
      }
    }
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
      isProvider: env.name === this.opts.providerEnvName,
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
        provider: opts.providerEnvName,
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

  /** The import rewrite of an environment (`source.transformImport`, R46), when it has one. */
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
   * resolver (per-environment aliases and conditions, R35); an environment
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

  /** The one invalidation operation (R3): the host's bundler rebuilds through the loader's `addDependency` set. */
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
   * JS/TS module of an environment from the text Rspack hands it (R11),
   * composes maps with the input map (S4), records dependencies, server-fn
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
    if (
      !late &&
      NODE_MODULES_RE.test(identity.path) &&
      !(ip?.inScope(identity.path) ?? false) &&
      !START_TEXT_RE.test(source)
    ) {
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
    this.reportDiagnostics(ctx, out, identity.path, source)
    const ipEnv = ip?.env(env.name)
    env.compiled.add(ctx.resource)
    if (ipEnv) {
      // registers the edges and, in development, reports the violations of
      // this compile (a plan the cache answered again included: an importer
      // Rspack rebuilt for a dependency's edit reports once per compile)
      const { error } = ipEnv.afterCompile(id, out)
      if (error) {
        throw error
      }
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
  ): void {
    if (out.diagnostics.length === 0) {
      return
    }
    let text: SourceText | null = null
    const where = (d: Diagnostic): string => {
      if (!d.range) {
        return file
      }
      text ??= new SourceText(code)
      const at = text.locate(d.range.start)
      return `${file}:${at.line + 1}:${at.column + 1}`
    }
    const errors: Array<string> = []
    for (const d of out.diagnostics) {
      if (d.by === 'parse') {
        // the bundler's own parser reports the error at the user's position
        continue
      }
      if (d.severity === 'error') {
        errors.push(`${d.message}\n    at ${where(d)}`)
      } else if (this.warnings.once(file, d)) {
        const warning = new Error(`${d.message}\n    at ${where(d)}`)
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
   * environment is the provider (R44); in development every entry, with a
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
    })
  }

  /** The entries of a rank for the custom-id allocation (R40): client-referenced first, the rest after. */
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
  const normalized = normalizePath(resource)
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
