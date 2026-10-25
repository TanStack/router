/**
 * Start's Vite host of the compiler core (DESIGN §4.1; D1, D8, R3, R11,
 * R35): one `enforce: 'pre'` plugin per Start env compiling every id it is
 * handed text for through ONE `compileModule` (env and derived ids alike)
 * with the planners in the core's fixed order — `start-env`, `hydrate`,
 * `rsc-css`, `route-split`, `route-hmr`, `import-edges` — the one
 * invalidation operation on `hotUpdate`, the server-fn registry shared by
 * the envs, the dev lookup and production resolver modules, the custom-id
 * patching at `renderChunk`, and import protection's host side (edge
 * modules, dev reports, build witness + fixed-point veto rebuild, the late
 * pass for non-JS importers).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import {
  OutputBuilder,
  RawFactsCache,
  SourceText,
  WarningLedger,
  compileModule,
  createCompilerCaches,
  deriveId,
  digestOf,
  identify,
  invalidate,
  isAnalyzableSpecifier,
} from '@tanstack/router-utils/compiler'
import { defaultCodeSplitGroupings } from '@tanstack/router-plugin'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '@tanstack/router-plugin/context'
import {
  RouteRegistryView,
  routerPlannerConfig,
  routerPlanners,
} from '@tanstack/router-plugin/planners'
import {
  DEV_CLIENT_ENTRY,
  TRANSFORM_ID_REGEX,
  VITE_ENVIRONMENT_NAMES,
} from '../constants'
import { startRecognizer } from '../compiler/recognizer'
import { HYDRATE_PLANNER, createHydratePlanner } from '../planners/hydrate'
import { START_ENV, startPlanners } from '../planners'
import { FunctionIdAllocator, decodeDevFunctionId } from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import {
  SERVER_FN_LOOKUP_VIRTUAL_ID,
  devLookupModule,
  devResolverModule,
  productionResolverModule,
  unreferencedWarning,
} from '../server-fns/resolver'
import { createImportProtection } from '../import-protection/session'
import {
  EDGE_MODULE_PREFIX,
  resolveViteEdgeModuleId,
} from '../import-protection/edge-modules'
import { viteDevGraphView } from '../import-protection/graph-trace'
import {
  discardBundle,
  readRolldownWitness,
  rolldownGraphView,
} from '../import-protection/witness'
import { resolveViteId } from '../utils'
import { createVirtualModule } from './createVirtualModule'
import { readVerbatimModuleSyntax } from './tsconfig'
import type { ImportProtection } from '../import-protection/session'
import type { HydratePlannerConfig } from '../planners/hydrate'
import type { GenerateFunctionId } from '../server-fns/ids'
import type { ServerFnEntry } from '../server-fns/registry'
import type { RscCssConfig, StartEnvConfig, StartEnvFacts } from '../planners'
import type { CompileStartFrameworkOptions, GetConfigFn } from '../types'
import type { RouterPluginContext } from '@tanstack/router-plugin/context'
import type { RouterPlannerConfig } from '@tanstack/router-plugin/planners'
import type {
  CompileConfig,
  CompilerCaches,
  Diagnostic,
  EnvInfo,
  HostServices,
  InputSourceMap,
  InvalidateChange,
  Planner,
} from '@tanstack/router-utils/compiler'
import type {
  BuildEnvironment,
  DevEnvironment,
  Environment,
  EnvironmentModuleNode,
  Plugin,
  PluginOption,
  ViteBuilder,
  ViteDevServer,
} from 'vite'

export interface StartRscCompilerOptions {
  /** The RSC host's CSS loader expression (`import.meta.viteRsc.loadCss()`). */
  loadCssExpression: string
  /** The directive derived provider modules carry, if any. */
  providerDirective?: string
}

export interface StartCompilerEnvironment {
  name: string
  type: 'client' | 'server'
  getServerFnById?: string
}

export interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<StartCompilerEnvironment>
  generateFunctionId?: GenerateFunctionId
  /** The Vite environment name of the server function provider. */
  providerEnvName: string
  rsc?: StartRscCompilerOptions | undefined
  getConfig: GetConfigFn
  /** The generator's registry (route modules by file), shared with the generator plugin. */
  routerPluginContext: RouterPluginContext
  /** The app's resolved entries (import protection's trace roots). */
  resolveEntries: () => {
    entryPaths: {
      client: string
      server: string
      start: string
      router: string
    }
  }
}

const PROVIDER_QUERY = 'tss-serverfn-split'

/** A module naming no server-fn factory nor `.handler(` defines no server function (the Rsbuild session's text gate, D14). */
const SERVER_FN_TEXT_RE = /createServerFn|\.handler\s*\(/

/** Specifiers of the compiler's own derived modules (`./x.tsx?tsr-split=…`, `?tss-hydrate=…`) and import protection's edge modules. */
const OWNED_QUERY_RE =
  /(?:^|[?&])(?:tsr-split|tss-hydrate|tss-serverfn-split)(?:=|&|$)/
const IP_SPECIFIER_RE = /tanstack-start-ip:/

/** Ids the late import-protection pass never compiles (not code, or served by the pre plugin). */
const LATE_PASS_EXCLUDE: Array<RegExp> = [
  ...TRANSFORM_ID_REGEX,
  /^\0/,
  /[\\/]node_modules[\\/]/,
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|json|json5|yaml|yml|toml|html|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|flac|aac|pdf|txt|wasm|zip)(?:\?|$)/i,
  /[?&](?:raw|url|inline|worker|sharedworker)(?:&|$)/,
]

/** The specifier of a module id for the dev module runner: root-relative, or `/@fs/` for files outside the root. */
export function toDevSpecifier(id: string, root: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normalized = id.replace(/\\/g, '/')
  if (normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length)
  }
  return normalized.startsWith('/') ? `/@fs${normalized}` : `/@fs/${normalized}`
}

const normalizePath = (p: string): string => p.replace(/\\/g, '/')

/**
 * The source entry of a pre-bundled dependency, when `id` is the dependency
 * optimizer's bundle (`node_modules/.vite/deps/x.js?v=…`): the optimizer
 * resolves a dependency to its bundle before the bundle is written, so facts
 * read through that path would see a missing module; the package's own entry
 * is what the dependency is (deterministic, and stable across re-optimization).
 */
function unoptimizedDependency(environment: Environment, id: string): string {
  const optimizer = (environment as DevEnvironment).depsOptimizer
  if (!optimizer || !id.includes('/node_modules/.vite/')) {
    return id
  }
  const file = id.split('?')[0]!
  const { optimized, discovered } = optimizer.metadata as {
    optimized: Record<string, { file: string; src?: string }>
    discovered?: Record<string, { file: string; src?: string }>
  }
  for (const table of [optimized, discovered ?? {}]) {
    for (const info of Object.values(table)) {
      if (info.file === file && info.src) {
        return info.src
      }
    }
  }
  return id
}

/**
 * The map of a transform's input, or null when the input is the original
 * source: Vite answers an empty sourcemap chain with an identity map over
 * the input (its positions are the source's own, and such a map counts
 * lines by LF only, unlike ECMAScript).
 */
function inputMapOf(
  ctx: { getCombinedSourcemap: () => unknown },
  code: string,
): InputSourceMap | null {
  const map = ctx.getCombinedSourcemap() as InputSourceMap & {
    sourcesContent?: Array<string | null>
  }
  if (map.sourcesContent?.length === 1 && map.sourcesContent[0] === code) {
    return null
  }
  return map
}

/** What one dev server or build shares across the Start environments (created at `configResolved`). */
interface Session {
  root: string
  mode: 'dev' | 'build'
  bundledDev: boolean
  ip: ImportProtection | null
  rawFacts: RawFactsCache
  caches: CompilerCaches
  registry: RouteRegistryView
  warnings: WarningLedger
  planners: Map<string, Array<Planner>>
  configs: Map<string, CompileConfig>
  /** The app's entry module ids (dev traces start there). */
  entries: Set<string>
}

export function startCompilerPlugin(
  opts: StartCompilerPluginOptions,
): PluginOption {
  const recognizer = startRecognizer()
  const ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
  const envNames = new Set(opts.environments.map((e) => e.name))
  const resolverEnvironments = new Set(
    ssrIsProvider
      ? [opts.providerEnvName]
      : [VITE_ENVIRONMENT_NAMES.server, opts.providerEnvName],
  )
  const registry = new ServerFnRegistry()
  const allocator = opts.generateFunctionId
    ? new FunctionIdAllocator(opts.generateFunctionId)
    : null

  /** Per-env loaders of genuinely virtual ids (the dev plugin container, or `this.load` in a build). */
  const virtualLoaders = new Map<
    string,
    (id: string) => Promise<string | null>
  >()
  let session: Session | null = null
  let server: ViteDevServer | null = null
  let unsubscribeRoutes: (() => void) | null = null
  /** One compiler invalidation per watcher event, applied by every env's `hotUpdate`. */
  const invalidations = new Map<
    string,
    Promise<Awaited<ReturnType<typeof invalidate>>>
  >()
  /**
   * Per env: files whose plans an `unlink` evicted or made stale, to
   * re-transform when a file appears (see `applyInvalidation`).
   */
  const awaitingAdd = new Map<string, Set<string>>()

  const requireSession = (): Session => {
    if (!session) {
      throw new Error(
        '[tanstack-start] the compiler plugin is used before `configResolved`',
      )
    }
    return session
  }

  /** Pre-bundled dependencies are opaque (a discovered Start library is never pre-bundled); everything else resolved is read. */
  const isOpaque = (canonicalId: string): boolean =>
    identify(canonicalId)
      .path.replace(/\\/g, '/')
      .includes('/node_modules/.vite/')

  const envOf = (name: string): StartCompilerEnvironment | undefined =>
    opts.environments.find((e) => e.name === name)

  /** The router planners' configuration of an env (Start's wiring: split + HMR + `deleteNodes` on the client, `deleteNodes` only on servers; R24). */
  const routerConfigFor = (
    env: StartCompilerEnvironment,
  ): RouterPlannerConfig => {
    const cs = opts.getConfig().startConfig.router.codeSplittingOptions
    return {
      framework: opts.framework,
      split: true,
      defaultGroupings: cs?.defaultBehavior ?? defaultCodeSplitGroupings,
      splitBehavior: cs?.splitBehavior,
      deleteNodes:
        env.type === 'client'
          ? ['ssr', 'server', 'headers']
          : (cs?.deleteNodes ?? []),
      hmr: { enabled: env.type === 'client', style: 'vite' },
    }
  }

  /** Whether the router planners run in an env: every Start env but a separate server-fn provider (RSC). */
  const routerAppliesTo = (env: StartCompilerEnvironment): boolean =>
    ssrIsProvider || env.name !== opts.providerEnvName

  const createSession = (config: {
    root: string
    command: 'serve' | 'build'
    bundledDev: boolean
  }): Session => {
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    const mode = config.command === 'build' ? 'build' : 'dev'
    const ip = createImportProtection({
      options: startConfig.importProtection,
      root: config.root,
      srcDirectory: resolvedStartConfig.srcDirectory,
      mode,
      verbatimModuleSyntax: readVerbatimModuleSyntax(config.root),
      isEntry: (p) =>
        session !== null && entriesOf(session).has(normalizePath(p)),
    })
    const rawFacts = new RawFactsCache({
      readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
      loadVirtual: async (id) => {
        for (const load of virtualLoaders.values()) {
          const code = await load(id).catch(() => null)
          if (code !== null) {
            return code
          }
        }
        return null
      },
      recognizer,
      ...(ip && { markerSpecifiers: ip.markerSpecifiers }),
    })
    const s: Session = {
      root: config.root,
      mode,
      bundledDev: config.bundledDev,
      ip,
      rawFacts,
      caches: createCompilerCaches(rawFacts),
      registry: new RouteRegistryView(opts.routerPluginContext),
      warnings: new WarningLedger(() => {}),
      planners: new Map(),
      configs: new Map(),
      entries: new Set(),
    }
    for (const env of opts.environments) {
      ip?.env(env.name, env.type)
      const routerCfg = routerAppliesTo(env) ? routerConfigFor(env) : null
      const rscCss = opts.rsc !== undefined && env.name === opts.providerEnvName
      s.planners.set(
        env.name,
        startPlanners({
          hydrate: createHydratePlanner(),
          rscCss,
          router: routerCfg ? routerPlanners() : undefined,
          importEdges: ip?.planner ?? null,
        }),
      )
      const idMode: StartEnvConfig['idMode'] =
        mode === 'dev' ? 'dev' : allocator ? 'placeholder' : 'default'
      const startEnv: StartEnvConfig = {
        framework: opts.framework,
        root: config.root,
        providerSeparate: !ssrIsProvider,
        idMode,
        providerDirective: opts.rsc?.providerDirective,
        isOpaque,
      }
      const hydrate: HydratePlannerConfig = { root: config.root }
      const rscCssConfig: RscCssConfig | undefined = opts.rsc
        ? { loadCssExpression: opts.rsc.loadCssExpression }
        : undefined
      s.configs.set(env.name, {
        configKey: digestOf({
          framework: opts.framework,
          root: config.root,
          provider: opts.providerEnvName,
          ssrIsProvider,
          idMode,
          rsc: opts.rsc ?? null,
          env: env.name,
          router: routerCfg && {
            split: routerCfg.split,
            groupings: routerCfg.defaultGroupings,
            splitBehavior: routerCfg.splitBehavior?.toString() ?? null,
            deleteNodes: [...routerCfg.deleteNodes],
            hmr: routerCfg.hmr,
          },
          ip: ip?.config.configKey ?? null,
        }),
        perPlanner: {
          [START_ENV]: startEnv,
          [HYDRATE_PLANNER]: hydrate,
          'rsc-css': rscCssConfig,
          ...(routerCfg && routerPlannerConfig(routerCfg)),
        } as Record<string, unknown>,
      })
    }
    return s
  }

  /** The app's entry ids: traces of dev reports start at them (lazily: the entries are resolved after `config`). */
  const entriesOf = (s: Session): Set<string> => {
    if (s.entries.size === 0) {
      const { resolvedStartConfig } = opts.getConfig()
      const { entryPaths } = opts.resolveEntries()
      for (const p of [
        resolvedStartConfig.routerFilePath,
        resolvedStartConfig.startFilePath,
        entryPaths.client,
        entryPaths.server,
        entryPaths.router,
        entryPaths.start,
      ]) {
        if (p) {
          s.entries.add(normalizePath(p))
        }
      }
      s.entries.add(resolveViteId(DEV_CLIENT_ENTRY))
      s.entries.add(DEV_CLIENT_ENTRY)
    }
    return s.entries
  }

  const envInfoOf = (
    environment: Environment,
    env: StartCompilerEnvironment,
  ): EnvInfo => ({
    name: env.name,
    type: env.type,
    isProvider: env.name === opts.providerEnvName,
    mode: environment.mode === 'build' ? 'build' : 'dev',
    bundler: 'vite',
    framework: opts.framework,
    conditions: environment.config.resolve.conditions,
    // Every router env splits (as main did): the server must render the tree
    // the client hydrates. Solid's hydration keys follow the component tree
    // (the lazy wrapper's components), and React wraps a match in Suspense
    // when its error component is lazy (`errorComponent.preload`), so an
    // unsplit server (R24) mismatches every split route with an
    // errorComponent and no pendingComponent.
    routerSplit: true,
  })

  /** Host services bound to one hook context. */
  const hostFor = (
    s: Session,
    environment: Environment,
    resolve: (
      source: string,
      importer?: string,
      options?: { skipSelf?: boolean },
    ) => Promise<{ id: string; external?: boolean | string } | null>,
  ): HostServices => ({
    resolve: async (specifier, importer) => {
      const r = await resolve(specifier, importer, { skipSelf: true })
      if (!r) {
        return null
      }
      return {
        id: unoptimizedDependency(environment, r.id),
        external: r.external === true || typeof r.external === 'string',
      }
    },
    readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
    loadVirtual: (id) =>
      virtualLoaders.get(environment.name)?.(id) ?? Promise.resolve(null),
    rawFacts: s.rawFacts,
    warnings: s.warnings,
    routes: s.registry,
    services: { routes: s.registry },
  })

  /** The host of the invalidation operation (a dev environment's own resolver). */
  const invalidationHost = (
    s: Session,
    environment: DevEnvironment,
  ): HostServices =>
    hostFor(s, environment, async (specifier, importer) => {
      const r = await environment.pluginContainer.resolveId(specifier, importer)
      return r ? { id: r.id, external: r.external === true } : null
    })

  /**
   * Applies one invalidation to an env's module graph: the nodes of the
   * evicted and dependent plans are hard-invalidated and returned (the host
   * side of the one operation; Vite re-transforms them and propagates their
   * updates). Except on `unlink`: Vite propagates the deleted module's own
   * update to its importers at once, and a dependent transformed while the
   * file is missing fails at `vite:import-analysis`, which marks it not
   * self-accepting, so its later updates go through its importers (a route
   * module, whose split component is never re-imported: the page keeps the
   * old module). Such dependents keep their soft-invalidated output until a
   * file appears (`add`), then re-transform; a plan of theirs the core
   * evicted at `unlink` is compiled then.
   */
  const applyInvalidation = (
    environment: Environment,
    change: InvalidateChange,
    res: Awaited<ReturnType<typeof invalidate>>,
    timestamp: number,
  ): Array<EnvironmentModuleNode> => {
    const paths = new Set<string>()
    for (const k of [...res.evicted, ...res.dependents]) {
      if (k.env !== environment.name) {
        continue
      }
      const p = identify(k.canonicalId).path
      if (p !== change.path) {
        paths.add(p)
      }
    }
    let waiting = awaitingAdd.get(environment.name)
    if (!waiting) {
      waiting = new Set()
      awaitingAdd.set(environment.name, waiting)
    }
    if (change.kind === 'unlink') {
      for (const p of paths) {
        waiting.add(p)
      }
      return []
    }
    if (change.kind === 'add') {
      for (const p of waiting) {
        paths.add(p)
      }
      waiting.clear()
    }
    if (change.kind === 'registry') {
      // the changed file's own plans are evicted too: re-transform them
      paths.add(change.path)
    }
    const graph = (environment as DevEnvironment).moduleGraph
    const seen = new Set<EnvironmentModuleNode>()
    const nodes: Array<EnvironmentModuleNode> = []
    for (const p of paths) {
      for (const m of graph.getModulesByFile(p) ?? []) {
        graph.invalidateModule(m, seen, timestamp, true, false)
        nodes.push(m)
      }
    }
    return nodes
  }

  /** Registry changes (the generator published a new `routesByFile`): route modules whose entry changed re-plan (`kind: 'registry'`). */
  const invalidateRegistry = async (file: string): Promise<void> => {
    const s = session
    if (!s || !server) {
      return
    }
    const environments = Object.values(server.environments)
    const first = environments[0]
    if (!first) {
      return
    }
    const change: InvalidateChange = {
      path: normalizePath(file),
      kind: 'registry',
    }
    const res = await invalidate(s.caches, change, invalidationHost(s, first))
    const now = Date.now()
    for (const environment of environments) {
      if (envNames.has(environment.name)) {
        applyInvalidation(environment, change, res, now)
      }
    }
  }

  /** Whether `env` is a server-fn provider of its own (RSC), not the SSR environment. */
  const isSeparateProvider = (env: StartCompilerEnvironment): boolean =>
    !ssrIsProvider && env.name === opts.providerEnvName

  /**
   * A separate provider's build (RSC; plugin-rsc's `buildApp` builds the
   * provider before the client, after scanning the provider and the SSR
   * environments). The provider's graph unfolds from its manifest, which
   * lists the server functions the scans registered. The SSR scan compiles
   * a server-fn module as a caller: its handlers are deleted, with the
   * imports only they read, so a `'use client'` component a handler renders
   * (through a server component) and the server-fn modules that component
   * imports are seen by no environment before the client builds: their
   * functions were missing from the manifest (J4.2, #7943). Before the
   * provider's real build, the raw reach of every registered server-fn
   * module (static and lazy imports, project modules only, what the deleted
   * handlers read included) is walked, and each module that may define a
   * server function is compiled in the provider environment, outside any
   * transform, so the manifest lists its functions; the build then imports
   * and compiles it in place (the plans are reused).
   */
  const compileHandlerReach = async (
    s: Session,
    env: StartCompilerEnvironment,
    environment: Environment,
    host: HostServices,
  ): Promise<void> => {
    const seen = new Set<string>()
    const queue = registry.entries().map((e) => e.definingCanonicalId)
    while (queue.length > 0) {
      const id = queue.pop()!
      if (seen.has(id)) {
        continue
      }
      seen.add(id)
      const identity = identify(id)
      if (/[\\/]node_modules[\\/]/.test(identity.path)) {
        continue
      }
      const facts = await s.rawFacts.get(identity.canonicalId)
      if (!facts.targetFacts.exists) {
        continue
      }
      if (!registry.definedIn(identity.canonicalId)) {
        const code = await fs.readFile(identity.path, 'utf8').catch(() => null)
        // the cheap text gate of a module that may define a server function (D14)
        if (code !== null && SERVER_FN_TEXT_RE.test(code)) {
          const out = await compileModule(
            {
              id: identity.canonicalId,
              code,
              env: envInfoOf(environment, env),
              planners: s.planners.get(env.name)!,
              config: s.configs.get(env.name)!,
              inputMap: () => null,
              wantMap: false,
            },
            host,
            s.caches,
          )
          const startFacts = out?.facts.planners[START_ENV] as
            | StartEnvFacts
            | undefined
          if (startFacts && startFacts.serverFns.length > 0) {
            registry.record(
              identity.canonicalId,
              startFacts.serverFns,
              env.type,
            )
          }
        }
      }
      for (const spec of [
        ...facts.targetFacts.imports,
        ...facts.targetFacts.lazyImports,
      ]) {
        if (s.rawFacts.isKnownSpecifier(spec) || !isAnalyzableSpecifier(spec)) {
          continue
        }
        const r = await host.resolve(spec, identity.canonicalId)
        if (r && !r.external) {
          queue.push(identify(r.id).canonicalId)
        }
      }
    }
  }

  const providerModuleIdOf = (e: ServerFnEntry): string =>
    e.providerDerived
      ? deriveId(e.definingCanonicalId, { kind: 'provider', value: '' })
      : e.definingCanonicalId

  /** A diagnostic's location: 1-based line, 0-based column, counting every ECMAScript line terminator. */
  const locationOf = (
    source: SourceText,
    filePath: string,
    d: Diagnostic,
  ): { file: string; line: number; column: number } | undefined => {
    if (!d.range) {
      return undefined
    }
    const { line, column } = source.locate(d.range.start)
    return { file: filePath, line: line + 1, column }
  }
  /**
   * Errors fail the module (every compile that produces them); warnings
   * once per (file, reason and wording) per session: a transform that
   * leaves a finding as it is does not repeat it, a new finding is reported.
   */
  const reportDiagnostics = (
    s: Session,
    ctx: {
      warn: (w: {
        message: string
        loc?: { file: string; line: number; column: number }
      }) => void
      error: (e: {
        message: string
        id?: string
        loc?: { file: string; line: number; column: number }
      }) => never
    },
    diagnostics: ReadonlyArray<Diagnostic>,
    filePath: string,
    id: string,
    code: string,
  ) => {
    if (diagnostics.length === 0) {
      return
    }
    const source = new SourceText(code)
    for (const d of diagnostics) {
      if (d.by === 'parse') {
        // the module is left as it is: the bundler's own parser reports a
        // syntax error at the user's position, and a script no ESM parse
        // accepts (a CommonJS dependency with a top-level `return`) is
        // nothing the compiler touches (J4.16, §5.15)
        continue
      }
      if (d.severity === 'error') {
        const loc = locationOf(source, filePath, d)
        ctx.error({
          message: loc
            ? `${d.message} (${filePath}:${loc.line}:${loc.column + 1})`
            : d.message,
          id,
          loc,
        })
      }
    }
    for (const d of diagnostics) {
      if (d.severity !== 'warning') {
        continue
      }
      const keyed = d.code ? { ...d, code: `${d.code}\u0000${d.message}` } : d
      if (s.warnings.once(filePath, keyed)) {
        const loc = locationOf(source, filePath, d)
        ctx.warn({
          message: loc
            ? `${d.message} (${filePath}:${loc.line}:${loc.column + 1})`
            : d.message,
          loc,
        })
      }
    }
  }

  /** Import protection's outcome of a compile: edge modules registered, dev reports queued; an `error`-behaviour violation fails the module. */
  const afterCompile = (
    s: Session,
    env: StartCompilerEnvironment,
    id: string,
    out: { output: string; facts: { planners: Record<string, unknown> } },
    fail: (error: Error) => never,
  ): void => {
    if (!s.ip) {
      return
    }
    const ipEnv = s.ip.env(env.name, env.type)
    const { error } = ipEnv.afterCompile(id, out)
    if (error) {
      fail(error)
    }
    // a host completion event (R21): print the reports whose importers the
    // graph (or the judged edges) can reach now, before the module is served
    ipEnv.reporter?.flush()
  }

  const changeKindOf = (
    event: 'create' | 'update' | 'delete',
  ): InvalidateChange['kind'] =>
    event === 'delete' ? 'unlink' : event === 'create' ? 'add' : 'change'

  function perEnvPlugin(env: StartCompilerEnvironment): Plugin {
    return {
      name: `tanstack-start:compiler:${env.name}`,
      enforce: 'pre',
      perEnvironmentWatchChangeDuringDev: true,
      applyToEnvironment(e) {
        return e.name === env.name
      },
      configResolved(config) {
        if (!session) {
          session = createSession({
            root: config.root,
            command: config.command,
            bundledDev: !!config.experimental.bundledDev,
          })
          unsubscribeRoutes?.()
          unsubscribeRoutes = onRoutesChanged(
            opts.routerPluginContext,
            (next, previous) => {
              for (const file of changedRoutePaths(next, previous)) {
                void invalidateRegistry(file)
              }
            },
          )
        }
      },
      configureServer(viteServer) {
        server = viteServer
        const s = requireSession()
        const environment = viteServer.environments[env.name]
        if (s.ip && environment) {
          const ipEnv = s.ip.env(env.name, env.type)
          const entries = entriesOf(s)
          ipEnv.graph = viteDevGraphView(environment.moduleGraph, (id) =>
            entries.has(id),
          )
          const reporter = ipEnv.useDevReporter({
            warn: (message) => environment.logger.warn(message),
          })
          viteServer.httpServer?.once('close', () => reporter.close())
        }
        viteServer.httpServer?.once('close', () => {
          unsubscribeRoutes?.()
          unsubscribeRoutes = null
        })
      },
      async buildStart() {
        const s = requireSession()
        if (this.environment.mode === 'build' && env.type === 'client') {
          // a new build: the registry of the previous one is gone (the client builds first)
          registry.clear()
          // one warning per file per run
          s.warnings.reset()
        }
        if (
          this.environment.mode === 'build' &&
          this.environment.config.build.write !== false &&
          isSeparateProvider(env)
        ) {
          await compileHandlerReach(
            s,
            env,
            this.environment,
            hostFor(s, this.environment, (source, imp, options) =>
              this.resolve(source, imp, options),
            ),
          )
        }
        const environment = this.environment
        virtualLoaders.set(env.name, async (id) => {
          if (environment.mode === 'dev') {
            const loaded = await environment.pluginContainer.load(id)
            if (loaded === null || loaded === undefined) {
              return null
            }
            return typeof loaded === 'string' ? loaded : loaded.code
          }
          const info = await this.load({ id })
          return info.code
        })
      },
      closeBundle() {
        if (this.environment.mode === 'build') {
          unsubscribeRoutes?.()
          unsubscribeRoutes = null
        }
      },
      resolveId: {
        filter: { id: [OWNED_QUERY_RE, IP_SPECIFIER_RE] },
        handler(source, importer) {
          const edge = resolveViteEdgeModuleId(source)
          if (edge !== null) {
            return edge
          }
          // a derived module of the compiler (`./route.tsx?tsr-split=…`): the
          // importer's sibling with the query verbatim, no file system (§3.5.4)
          if (!importer || !source.startsWith('./')) {
            return null
          }
          const q = source.indexOf('?')
          if (q === -1 || !OWNED_QUERY_RE.test(source.slice(q))) {
            return null
          }
          const basename = source.slice(2, q)
          if (basename.includes('/')) {
            return null
          }
          const dir = path.posix.dirname(normalizePath(identify(importer).path))
          return `${dir}/${basename}${source.slice(q)}`
        },
      },
      load: {
        filter: { id: IP_SPECIFIER_RE },
        handler(id) {
          const s = requireSession()
          const load = s.ip?.load(id)
          return load
            ? { code: load.code, moduleSideEffects: load.moduleSideEffects }
            : null
        },
      },
      transform: {
        filter: { id: { include: TRANSFORM_ID_REGEX } },
        async handler(code, id) {
          const identity = identify(id)
          if (identity.lang === null) {
            return null
          }
          const s = requireSession()
          const environment = this.environment
          const envInfo = envInfoOf(environment, env)
          const out = await compileModule(
            {
              id,
              code,
              env: envInfo,
              planners: s.planners.get(env.name)!,
              config: s.configs.get(env.name)!,
              inputMap: () => inputMapOf(this, code),
              // always: downstream plugins read positions through the combined map, whatever `build.sourcemap` says
              wantMap: true,
            },
            hostFor(s, this.environment, (source, imp, options) =>
              this.resolve(source, imp, options),
            ),
            s.caches,
          )
          if (!out) {
            return null
          }
          reportDiagnostics(s, this, out.diagnostics, identity.path, id, code)
          const facts = out.facts.planners[START_ENV] as
            | StartEnvFacts
            | undefined
          if (facts && facts.serverFns.length > 0) {
            registry.record(identity.canonicalId, facts.serverFns, env.type)
          }
          afterCompile(s, env, id, out, (error) => this.error(error))
          if (identity.derived === null && out.code === code) {
            return null
          }
          return {
            code: out.code,
            map: out.map as never,
            moduleSideEffects: out.sideEffectFree ? false : undefined,
          }
        },
      },
      async hotUpdate(ctx) {
        const s = requireSession()
        const change: InvalidateChange = {
          path: ctx.file,
          kind: changeKindOf(ctx.type),
        }
        const key = `${ctx.file}\u0000${ctx.timestamp}`
        let pending = invalidations.get(key)
        if (!pending) {
          pending = invalidate(
            s.caches,
            change,
            invalidationHost(s, this.environment),
          )
          invalidations.set(key, pending)
          setTimeout(() => invalidations.delete(key), 10_000).unref()
        }
        const res = await pending
        if (ctx.type === 'delete') {
          registry.forget(ctx.file)
        }
        const extra = applyInvalidation(
          this.environment,
          change,
          res,
          ctx.timestamp,
        )
        return extra.length > 0 ? [...ctx.modules, ...extra] : undefined
      },
      async watchChange(id, change) {
        const s = requireSession()
        if (!s.bundledDev || this.environment.mode !== 'dev') {
          return
        }
        const environment = this.environment
        const kind = changeKindOf(change.event)
        const res = await invalidate(
          s.caches,
          { path: id, kind },
          invalidationHost(s, environment),
        )
        applyInvalidation(environment, { path: id, kind }, res, Date.now())
      },
      renderChunk(code, chunk) {
        if (!allocator || !code.includes('__TSS_FN_ID_')) {
          return null
        }
        const entries = registry.entries()
        allocator.allocate(
          env.type === 'client'
            ? entries.filter((e) => e.clientReferenced)
            : entries,
        )
        const patched = allocator.patch(code)
        if (patched.missing.length > 0) {
          this.error({
            message: `Server function ids could not be resolved in ${chunk.fileName}: ${patched.missing.join(', ')}`,
          })
        }
        const source = new SourceText(code)
        const builder = new OutputBuilder(source, chunk.fileName, { map: true })
        let pos = 0
        for (const e of patched.edits) {
          if (e.start > pos) {
            builder.copy(pos, e.start)
          }
          builder.text(e.text)
          pos = e.end
        }
        if (pos < code.length) {
          builder.copy(pos, code.length)
        }
        const built = builder.finish()
        return { code: built.code, map: built.map as never }
      },
      /**
       * Import protection's build verdict (§3.14.4, R30, R33): the edge
       * modules that survived tree-shaking → `onViolation` once per logical
       * edge per logical build → a veto asks for another pass of this
       * environment (`buildApp` below rebuilds it; this pass writes nothing);
       * the settled pass reports.
       */
      async generateBundle(_options, bundle) {
        const s = requireSession()
        if (!s.ip || this.environment.mode !== 'build') {
          return
        }
        const ipEnv = s.ip.env(env.name, env.type)
        const live = readRolldownWitness(bundle as never, ipEnv.witness())
        const result = await ipEnv.decide(
          live,
          rolldownGraphView((id) => this.getModuleInfo(id)),
        )
        if (result.needPass) {
          discardBundle(bundle)
          return
        }
        for (const report of ipEnv.buildReports()) {
          if (report.severity === 'error') {
            this.error(report.message)
          }
          this.warn(report.message)
        }
      },
    }
  }

  /**
   * The fixed-point veto rebuild (R33): every `builder.build(env)` of a Start
   * environment — Start's own `buildApp` loop or another driver's, such as
   * `@vitejs/plugin-rsc` — is one logical build, repeated while its
   * `generateBundle` asked for another pass.
   */
  const buildLoopPlugin: Plugin = {
    name: 'tanstack-start:import-protection-build-loop',
    apply: 'build',
    buildApp: {
      order: 'pre',
      handler(builder: ViteBuilder) {
        const s = requireSession()
        if (!s.ip) {
          return Promise.resolve()
        }
        const ip = s.ip
        const original = builder.build.bind(builder)
        builder.build = async (environment: BuildEnvironment) => {
          const env = envOf(environment.name)
          if (!env) {
            return original(environment)
          }
          const ipEnv = ip.env(env.name, env.type)
          ipEnv.beginLogicalBuild()
          let output: Awaited<ReturnType<typeof original>> | undefined
          await ipEnv.build.runToFixedPoint(async () => {
            output = await original(environment)
          })
          return output!
        }
        return Promise.resolve()
      },
    },
  }

  /**
   * The late import-protection pass (§3.14.5, R48): modules whose id is not
   * JS/TS but whose code reaches us as JS through other plugins (`.mdx`, a
   * compiled `.vue` module, custom types) are judged with the `import-edges`
   * planner alone, after the framework plugins (`post`), their positions
   * mapped through the combined source map.
   */
  const latePassPlugin: Plugin = {
    name: 'tanstack-start:import-protection-late',
    enforce: 'post',
    applyToEnvironment(e) {
      return envNames.has(e.name)
    },
    transform: {
      filter: {
        id: { exclude: LATE_PASS_EXCLUDE },
        code: { include: /\b(?:import|export)\b|\brequire\s*\(/ },
      },
      async handler(code, id) {
        const s = requireSession()
        const env = envOf(this.environment.name)
        if (!s.ip || !env || identify(id).lang !== null) {
          return null
        }
        const ip = s.ip
        const out = await compileModule(
          {
            id,
            code,
            lang: 'jsx',
            env: envInfoOf(this.environment, env),
            planners: [ip.planner],
            config: {
              configKey: `late:${ip.config.configKey}`,
              perPlanner: {},
            },
            inputMap: () => inputMapOf(this, code),
            wantMap: true,
          },
          hostFor(s, this.environment, (source, imp, options) =>
            this.resolve(source, imp, options),
          ),
          s.caches,
        )
        if (!out || out.diagnostics.some((d) => d.by === 'parse')) {
          // not JavaScript after all: nothing to judge
          return null
        }
        reportDiagnostics(s, this, out.diagnostics, identify(id).path, id, code)
        afterCompile(s, env, id, out, (error) => this.error(error))
        if (out.code === code) {
          return null
        }
        return { code: out.code, map: out.map as never }
      },
    },
  }

  const lookupPrefix = `\0${SERVER_FN_LOOKUP_VIRTUAL_ID}?`

  /**
   * R44 in development: a client-origin call of a function whose defining
   * module the client environment has not compiled (no client module in the
   * dev server's graph references it: a stale page after a restart, an
   * external caller, a serialized function) is answered, with one warning
   * per function saying a production build refuses it. The dev server
   * compiles lazily, so nothing short of crawling the client graph could
   * prove reachability; it is not attempted.
   */
  const devWarned = new Set<string>()
  const devLookupPlugin: Plugin = {
    name: 'tanstack-start:server-fn-lookup',
    apply: 'serve',
    applyToEnvironment(e) {
      return resolverEnvironments.has(e.name)
    },
    resolveId(source) {
      if (source.startsWith(`${SERVER_FN_LOOKUP_VIRTUAL_ID}?`)) {
        return `\0${source}`
      }
      return undefined
    },
    async load(id) {
      if (!id.startsWith(lookupPrefix)) {
        return undefined
      }
      const root = requireSession().root
      const params = new URLSearchParams(id.slice(lookupPrefix.length))
      const fnId = params.get('id') ?? ''
      let entry = registry.get(fnId)
      if (!entry) {
        // a fresh server: compile the defining module through the normal transform
        const key = decodeDevFunctionId(fnId)
        if (key && this.environment.mode === 'dev') {
          const abs = path.resolve(root, key.rootRel)
          await this.environment.transformRequest(abs).catch(() => null)
          entry = registry.get(fnId)
        }
      }
      if (!entry) {
        this.error(`Invalid server function ID: ${fnId}`)
      }
      if (
        params.get('origin') === 'client' &&
        !entry.clientReferenced &&
        !devWarned.has(fnId)
      ) {
        devWarned.add(fnId)
        this.warn(unreferencedWarning(entry))
      }
      const specifier = toDevSpecifier(providerModuleIdOf(entry), root)
      return devLookupModule(entry, specifier)
    },
  }

  const resolverPlugin = createVirtualModule({
    name: 'tanstack-start:server-fn-resolver',
    moduleId: VIRTUAL_MODULES.serverFnResolver,
    enforce: 'pre',
    applyToEnvironment: (e) => resolverEnvironments.has(e.name),
    load() {
      if (this.environment.name !== opts.providerEnvName) {
        const mod = envOf(this.environment.name)?.getServerFnById
        if (mod) {
          return mod
        }
        this.error(
          `No getServerFnById implementation found for caller environment: ${this.environment.name}`,
        )
      }
      if (this.environment.mode !== 'build') {
        return devResolverModule()
      }
      return productionResolverModule({
        entries: registry.entries(),
        providerModuleId: providerModuleIdOf,
        clientReferencedOnly: ssrIsProvider,
      })
    },
  })

  return [
    ...opts.environments.map(perEnvPlugin),
    buildLoopPlugin,
    latePassPlugin,
    devLookupPlugin,
    resolverPlugin,
  ]
}

export { PROVIDER_QUERY, EDGE_MODULE_PREFIX }
