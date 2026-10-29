/**
 * Start's Vite host of the compiler core (see the core's README.md,
 * "Hosts"): one `enforce: 'pre'` plugin per Start env compiling every id it is
 * handed text for through ONE `compileModule` (env and derived ids alike)
 * with the planners in the core's fixed order — `start-env`, `hydrate`,
 * `rsc-css`, `route-split`, `route-hmr`, `import-edges` — the one
 * invalidation operation on `hotUpdate`, the server-fn registry shared by
 * the envs, the dev lookup and production resolver modules, the custom-id
 * patching at `renderChunk`, and import protection's host side (edge
 * modules, dev reports, build witness + fixed-point veto rebuild, the late
 * pass for non-JS importers).
 */
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import {
  ASSET_QUERY_RE,
  OWNED_QUERY_RE,
  OutputBuilder,
  RawFactsCache,
  SourceText,
  WarningLedger,
  collectionSizes,
  compileModule,
  createCompilerCaches,
  deriveId,
  digestOf,
  eagerExportWarning,
  eagerExtractedExports,
  identify,
  invalidate,
  isAnalyzableSpecifier,
  isFinalBuild,
  registerCompilerStats,
  releaseEnvironment,
  resolveDerivedSibling,
  revision,
  rollupEntryModuleIds,
} from '@tanstack/router-utils/compiler'
import { defaultCodeSplitGroupings } from '@tanstack/router-plugin'
import { liveModules } from '@tanstack/router-plugin/vite'
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
import { namesStartSpecifier, startRecognizer } from '../compiler/recognizer'
import {
  NODE_MODULES_RE,
  opaquePackageModule,
  startCompileScope,
} from '../compiler/scope'
import { HYDRATE_PLANNER, createHydratePlanner } from '../planners/hydrate'
import { START_ENV, startPlanners } from '../planners'
import { FunctionIdAllocator, decodeDevFunctionId } from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import {
  SERVER_FN_LOOKUP_VIRTUAL_ID,
  callerGateModule,
  devLookupModule,
  devResolverModule,
  productionResolverModule,
  unreferencedWarning,
} from '../server-fns/resolver'
import { createImportProtection } from '../import-protection/session'
import { resolveViteEdgeModuleId } from '../import-protection/edge-modules'
import { viteDevGraphView } from '../import-protection/graph-trace'
import {
  discardBundle,
  readRolldownWitness,
  rolldownGraphView,
} from '../import-protection/witness'
import { resolveViteId } from '../utils'
import { createVirtualModule } from './createVirtualModule'
import type {
  DevCompileOutcome,
  ImportProtection,
} from '../import-protection/session'
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

/** A caller environment's forward to the provider's resolver (behind the production gate, J4.2). */
const SERVER_FN_FORWARD_VIRTUAL_ID = 'virtual:tanstack-start-server-fn-forward'

/** A module naming no server-fn factory nor `.handler(` defines no server function (a text gate before any analysis). */
const SERVER_FN_TEXT_RE = /createServerFn|\.handler\s*\(/

/** Specifiers of import protection's edge modules. */
const IP_SPECIFIER_RE = /tanstack-start-ip:/

/** Ids the late import-protection pass never compiles (not code, or served by the pre plugin). */
const LATE_PASS_EXCLUDE: Array<RegExp> = [
  ...TRANSFORM_ID_REGEX,
  /^\0/,
  NODE_MODULES_RE,
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|json|json5|yaml|yml|toml|html|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|flac|aac|pdf|txt|wasm|zip)(?:\?|$)/i,
  ASSET_QUERY_RE,
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
 * source: its positions are the source's own. Vite answers an empty
 * sourcemap chain with an identity map it builds over the whole input
 * (and such a map counts lines by LF only, unlike ECMAScript), so the
 * file as written is compared first.
 */
function inputMapOf(
  ctx: { getCombinedSourcemap: () => unknown },
  code: string,
  file: string,
): InputSourceMap | null {
  try {
    if (readFileSync(file, 'utf8') === code) {
      return null
    }
  } catch {
    // a virtual module: Vite's map
  }
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
  /** Whether a module is compiled (`startCompileScope`). */
  compiles: (path: string, code: string) => boolean
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
  registerCompilerStats('start:vite:plugin', registry, (r) =>
    collectionSizes(r),
  )
  registerCompilerStats('start:vite:invalidations', invalidations, (m) => ({
    size: m.size,
  }))
  registerCompilerStats('start:vite:awaitingAdd', awaitingAdd, (m) =>
    collectionSizes({ awaitingAdd: m }),
  )

  const requireSession = (): Session => {
    if (!session) {
      throw new Error(
        '[tanstack-start] the compiler plugin is used before `configResolved`',
      )
    }
    return session
  }

  /** Pre-bundled dependencies are opaque (a Start library declaring the framework as a peer is never pre-bundled); everything else resolved is read. */
  const isOpaque = (canonicalId: string): boolean =>
    identify(canonicalId)
      .path.replace(/\\/g, '/')
      .includes('/node_modules/.vite/')

  const envOf = (name: string): StartCompilerEnvironment | undefined =>
    opts.environments.find((e) => e.name === name)

  /** The router planners' configuration of an env (Start's wiring: splitting in every env, HMR and the client `deleteNodes` on the client, the server `deleteNodes` on servers). */
  const routerConfigFor = (
    env: StartCompilerEnvironment,
  ): RouterPlannerConfig => {
    const cs = opts.getConfig().startConfig.router.codeSplittingOptions
    return {
      framework: opts.framework,
      // Every router env splits (as main did): the server must render the tree
      // the client hydrates. Solid's hydration keys follow the component tree
      // (the lazy wrapper's components), and React wraps a match in Suspense
      // when its error component is lazy (`errorComponent.preload`), so an
      // unsplit server mismatches every split route with an
      // errorComponent and no pendingComponent.
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
      opaque: opaquePackageModule(ip),
    })
    const s: Session = {
      root: config.root,
      mode,
      bundledDev: config.bundledDev,
      ip,
      compiles: startCompileScope(ip),
      rawFacts,
      caches: createCompilerCaches(rawFacts, 'start:vite'),
      registry: new RouteRegistryView(opts.routerPluginContext),
      warnings: new WarningLedger(() => {}),
      planners: new Map(),
      configs: new Map(),
      entries: new Set(),
    }
    registerCompilerStats('start:vite:session', s, (o) =>
      collectionSizes(
        {
          ip: o.ip,
          warnings: o.warnings,
          routes: o.registry,
          entries: o.entries,
        },
        4,
      ),
    )
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
        // the rsc env evaluates only what the server fns need (a route module's client-only
        // module-level code, e.g. `createContext`, fails under `react-server`)
        alwaysDeriveProvider: opts.rsc !== undefined,
        isOpaque,
      }
      const hydrate: HydratePlannerConfig = {
        root: config.root,
        refreshMarkers:
          mode === 'dev' &&
          env.type === 'client' &&
          opts.framework === 'react' &&
          (routerCfg?.hmr.enabled ?? false),
      }
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
    rawFacts: s.rawFacts,
    routes: s.registry,
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
   * The hosts of one invalidation, per environment: each environment's
   * fingerprints are re-validated with its own resolver (per-environment
   * aliases and conditions); an environment the dev server does not
   * know falls back to the hook's own.
   */
  const invalidationHosts = (
    s: Session,
    viteServer: ViteDevServer | null,
    own: DevEnvironment,
  ): ((env: string) => HostServices) => {
    const hosts = new Map<string, HostServices>()
    return (name) => {
      let h = hosts.get(name)
      if (!h) {
        h = invalidationHost(s, viteServer?.environments[name] ?? own)
        hosts.set(name, h)
      }
      return h
    }
  }

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
  ): Array<{ node: EnvironmentModuleNode }> => {
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
    const nodes: Array<{ node: EnvironmentModuleNode }> = []
    for (const p of paths) {
      for (const m of graph.getModulesByFile(p) ?? []) {
        graph.invalidateModule(m, seen, timestamp, true, false)
        nodes.push({ node: m })
      }
    }
    return nodes
  }

  /** Digest of the compiler's last output per environment and module id (the transform hook records it). Bounded by the modules compiled. */
  const outputDigests = new Map<string, string>()

  /**
   * The dependents whose output the change altered: a dependent re-plans
   * (its plan was evicted), and the one the compiler emits again as the
   * page holds it is no update (D8: hard-invalidate where decisions
   * changed). Propagating it would only send the page a module it cannot
   * hot-apply (a route tree, accepted by nothing) and so a full reload,
   * e.g. after a route file gained an export. The comparison is of the
   * compiler's output, not Vite's (import analysis stamps `?t=` on the
   * imports of changed modules).
   */
  const changedDependents = async (
    environment: DevEnvironment,
    dependents: Array<{ node: EnvironmentModuleNode }>,
  ): Promise<Array<EnvironmentModuleNode>> => {
    const changed: Array<EnvironmentModuleNode> = []
    for (const { node } of dependents) {
      if (node.id !== null) {
        // Vite's own propagation of the file change may have cleared the
        // node's transform result already; the compiler's last output is
        // what the page holds
        const key = `${environment.name}\0${node.id}`
        const previous = outputDigests.get(key)
        if (previous !== undefined) {
          await environment.transformRequest(node.url).catch(() => null)
          if (outputDigests.get(key) === previous) {
            continue
          }
        }
      }
      changed.push(node)
    }
    return changed
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
    const res = await invalidate(
      s.caches,
      change,
      invalidationHosts(s, server, first),
    )
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
      if (NODE_MODULES_RE.test(identity.path)) {
        continue
      }
      const facts = await s.rawFacts.get(identity.canonicalId)
      if (!facts.targetFacts.exists) {
        continue
      }
      if (!registry.definedIn(identity.canonicalId)) {
        const code = await fs.readFile(identity.path, 'utf8').catch(() => null)
        // the cheap text gate of a module that may define a server function
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
    envType: 'client' | 'server',
  ) => {
    if (diagnostics.length === 0) {
      return
    }
    const source = new SourceText(code)
    for (const d of diagnostics) {
      if (d.by === 'parse') {
        // A module the compiler cannot parse is left as it is when it names
        // no Start package: the bundler's own parser reports a syntax error
        // at the user's position, and a script no ESM parse accepts (a
        // CommonJS dependency with a top-level `return`) is nothing the
        // compiler touches (J4.16, SPEC §5.15). One that names a Start package
        // may define server code (a handler, a server-only route option):
        // the client build fails naming the file (never shipped
        // untransformed, J4.12); a server build warns once.
        if (!namesStartSpecifier(code)) {
          continue
        }
        const loc = locationOf(source, filePath, d)
        const message = `[tanstack-start] The compiler cannot parse "${filePath}", which uses a TanStack Start or Router API, so it cannot compile its server code: ${d.message}${loc ? ` (${filePath}:${loc.line}:${loc.column + 1})` : ''}`
        if (envType === 'client') {
          ctx.error({ message, id, loc })
        }
        if (s.warnings.once(filePath, { ...d, code: 'parse' })) {
          ctx.warn({ message, loc })
        }
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

  /**
   * Import protection's outcome of a compile: edge modules registered, dev reports queued; an
   * `error`-behaviour violation fails the module. A promise only when violations are decided
   * now (`log: 'always'`).
   */
  const afterCompile = (
    s: Session,
    env: StartCompilerEnvironment,
    id: string,
    out: { output: string; facts: { planners: Record<string, unknown> } },
    fail: (error: Error) => never,
  ): Promise<void> | undefined => {
    if (!s.ip) {
      return undefined
    }
    const ipEnv = s.ip.env(env.name, env.type)
    const finish = ({ error }: DevCompileOutcome): void => {
      if (error) {
        fail(error)
      }
      // a host completion event (no microtask polling): print the reports whose importers the
      // graph (or the judged edges) can reach now, before the module is served
      ipEnv.reporter?.flush()
    }
    const outcome = ipEnv.afterCompile(id, out)
    if (outcome instanceof Promise) {
      return outcome.then(finish)
    }
    finish(outcome)
    return undefined
  }

  const changeKindOf = (
    event: 'create' | 'update' | 'delete',
  ): InvalidateChange['kind'] =>
    event === 'delete' ? 'unlink' : event === 'create' ? 'add' : 'change'

  /** The environment whose plugin runs `watchChange` (bundled dev): one invalidation per change, applied to every environment. */
  const watchingEnv = opts.environments[0]?.name
  function perEnvPlugin(env: StartCompilerEnvironment): Plugin {
    const watches = env.name === watchingEnv
    return {
      name: `tanstack-start:compiler:${env.name}`,
      enforce: 'pre',
      perEnvironmentWatchChangeDuringDev: watches,
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
          // a new build: the registry of the previous one is gone (the client
          // builds first; under RSC the rsc provider built before it and
          // allocated its entries first: deterministic, not client-first)
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
            // an importer's request for an edge module comes from its
            // transformed code (import analysis, or Rolldown): the import
            // survived the TypeScript transform, so a pending violation is
            // decided now; `error` fails the importer's import analysis
            const confirmation =
              importer !== undefined && session?.ip
                ? session.ip.env(env.name, env.type).confirm(edge)
                : null
            if (confirmation === null) {
              return edge
            }
            return confirmation.then((error) => {
              if (error) {
                throw error
              }
              return edge
            })
          }
          return resolveDerivedSibling(source, importer)
        },
      },
      load: {
        filter: { id: [IP_SPECIFIER_RE, OWNED_QUERY_RE] },
        async handler(id) {
          const s = requireSession()
          if (IP_SPECIFIER_RE.test(id)) {
            const load = s.ip?.load(id)
            return load
              ? { code: load.code, moduleSideEffects: load.moduleSideEffects }
              : null
          }
          // a derived id of a file of the project (`route.tsx?tsr-split=…`,
          // `?tss-hydrate=…`, `?tss-serverfn-split`) is the file's own text,
          // read here: Vite's load fallback cleans the id of its query and
          // fragment, and a `#` of a project path (`C#`, `project #2`) would
          // end the path there. A derived id with a foreign query
          // (`.vue?vue&…`) or of a virtual module is its owner's to load.
          const identity = identify(id)
          if (
            identity.derived === null ||
            identity.foreignQuery !== '' ||
            identity.path.startsWith('\0')
          ) {
            return null
          }
          const code = await fs
            .readFile(identity.path, 'utf8')
            .catch(() => null)
          if (code === null) {
            return null
          }
          this.addWatchFile(identity.path)
          return code
        },
      },
      transform: {
        filter: {
          id: { include: TRANSFORM_ID_REGEX, exclude: ASSET_QUERY_RE },
        },
        async handler(code, id) {
          const identity = identify(id)
          const s = requireSession()
          if (identity.lang === null || !s.compiles(identity.path, code)) {
            return null
          }
          const environment = this.environment
          const envInfo = envInfoOf(environment, env)
          const out = await compileModule(
            {
              id,
              code,
              env: envInfo,
              planners: s.planners.get(env.name)!,
              config: s.configs.get(env.name)!,
              inputMap: () => inputMapOf(this, code, identity.path),
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
          reportDiagnostics(
            s,
            this,
            out.diagnostics,
            identity.path,
            id,
            code,
            env.type,
          )
          const facts = out.facts.planners[START_ENV] as
            | StartEnvFacts
            | undefined
          if (facts && facts.serverFns.length > 0) {
            registry.record(identity.canonicalId, facts.serverFns, env.type)
          }
          const decided = afterCompile(s, env, id, out, (error) =>
            this.error(error),
          )
          if (decided) {
            await decided
          }
          if (s.mode === 'dev') {
            outputDigests.set(`${environment.name}\0${id}`, revision(out.code))
          }
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
            invalidationHosts(s, server, this.environment),
          )
          invalidations.set(key, pending)
          setTimeout(() => invalidations.delete(key), 10_000).unref()
        }
        const res = await pending
        if (ctx.type === 'delete') {
          registry.forget(ctx.file)
          s.ip?.forget(normalizePath(ctx.file))
        }
        const extra = applyInvalidation(
          this.environment,
          change,
          res,
          ctx.timestamp,
        )
        const changed = await changedDependents(
          this.environment as DevEnvironment,
          extra,
        )
        // see router-plugin's Vite host: the file's modules its current plan produces
        const live =
          (await liveModules(
            this.environment as DevEnvironment,
            s.caches,
            ctx.file,
            ctx.modules,
          )) ?? ctx.modules
        return changed.length > 0 || live !== ctx.modules
          ? [...live, ...changed]
          : undefined
      },
      // bundled dev: the one invalidation of a file event, applied to every
      // environment's module graph (Vite's `hotUpdate` is not called there;
      // this hook runs in `watchingEnv` only)
      ...(watches && {
        async watchChange(id, change) {
          const s = requireSession()
          if (!s.bundledDev || this.environment.mode !== 'dev') {
            return
          }
          const kind = changeKindOf(change.event)
          if (kind === 'unlink') {
            s.ip?.forget(normalizePath(id))
          }
          const res = await invalidate(
            s.caches,
            { path: id, kind },
            invalidationHosts(s, server, this.environment),
          )
          const now = Date.now()
          const environments = server
            ? Object.values(server.environments).filter((e) =>
                envNames.has(e.name),
              )
            : [this.environment]
          for (const environment of environments) {
            applyInvalidation(environment, { path: id, kind }, res, now)
          }
        },
      }),
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
       * Import protection's build verdict: the edge
       * modules that survived tree-shaking → `onViolation` once per logical
       * edge per logical build → a veto asks for another pass of this
       * environment (`buildApp` below rebuilds it; this pass writes nothing);
       * the settled pass reports.
       */
      async generateBundle(_options, bundle) {
        const s = requireSession()
        if (this.environment.mode !== 'build') {
          return
        }
        if (env.type === 'client') {
          // an extracted-export output an entry chunk (or a chunk it imports
          // statically) holds is eager whatever the splitter did: say so
          // once per file and export (J2.8; a pass that writes nothing
          // comes first under import protection's veto, the ledger dedups)
          for (const e of eagerExtractedExports(
            rollupEntryModuleIds(bundle as never),
          )) {
            const message = eagerExportWarning(e, 'rollup')
            if (
              s.warnings.once(e.file, {
                severity: 'warning',
                message,
                code: `eager-export\u0000${e.name}`,
              })
            ) {
              this.warn(message)
            }
          }
        }
        if (!s.ip) {
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
   * One logical build per `builder.build(env)` of a Start environment —
   * Start's own `buildApp` loop or another driver's, such as
   * `@vitejs/plugin-rsc` — repeated while its `generateBundle` asked for
   * another pass (import protection's fixed-point veto rebuild). A logical
   * build that writes its bundle (not a scan: plugin-rsc analyses the rsc
   * and ssr environments with `write: false` first and builds them again)
   * outside watch mode is the environment's last: its compiler state is
   * released before the next environment builds. What later environments
   * read stays in the session: the server-fn registry and id allocator,
   * the raw facts, the warnings ledger.
   */
  const buildLoopPlugin: Plugin = {
    name: 'tanstack-start:build-loop',
    apply: 'build',
    buildApp: {
      order: 'pre',
      handler(builder: ViteBuilder) {
        const s = requireSession()
        const original = builder.build.bind(builder)
        builder.build = async (environment: BuildEnvironment) => {
          const env = envOf(environment.name)
          if (!env) {
            return original(environment)
          }
          let output: Awaited<ReturnType<typeof original>> | undefined
          if (s.ip) {
            const ipEnv = s.ip.env(env.name, env.type)
            ipEnv.beginLogicalBuild()
            await ipEnv.build.runToFixedPoint(async () => {
              output = await original(environment)
            })
          } else {
            output = await original(environment)
          }
          if (isFinalBuild(environment.config.build)) {
            releaseEnvironment(s.caches, env.name)
            s.ip?.release(env.name)
          }
          return output!
        }
        return Promise.resolve()
      },
    },
  }

  /**
   * The late import-protection pass: modules whose id is not
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
            inputMap: () => inputMapOf(this, code, identify(id).path),
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
        reportDiagnostics(
          s,
          this,
          out.diagnostics,
          identify(id).path,
          id,
          code,
          env.type,
        )
        const decided = afterCompile(s, env, id, out, (error) =>
          this.error(error),
        )
        if (decided) {
          await decided
        }
        if (out.code === code) {
          return null
        }
        return { code: out.code, map: out.map as never }
      },
    },
  }

  const lookupPrefix = `\0${SERVER_FN_LOOKUP_VIRTUAL_ID}?`

  /**
   * J4.2 in development: a client-origin call of a function whose defining
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

  /** A caller environment's own `getServerFnById` module (the forward to the provider), behind the production gate. */
  const forwardPlugin = createVirtualModule({
    name: 'tanstack-start:server-fn-forward',
    moduleId: SERVER_FN_FORWARD_VIRTUAL_ID,
    enforce: 'pre',
    applyToEnvironment: (e) =>
      resolverEnvironments.has(e.name) && e.name !== opts.providerEnvName,
    load() {
      return envOf(this.environment.name)?.getServerFnById ?? null
    },
  })

  const resolverPlugin = createVirtualModule({
    name: 'tanstack-start:server-fn-resolver',
    moduleId: VIRTUAL_MODULES.serverFnResolver,
    enforce: 'pre',
    applyToEnvironment: (e) => resolverEnvironments.has(e.name),
    load() {
      if (this.environment.name !== opts.providerEnvName) {
        const mod = envOf(this.environment.name)?.getServerFnById
        if (mod) {
          if (this.environment.mode === 'build' && !ssrIsProvider) {
            // J4.2 with a separate provider (RSC): the provider built before
            // the client, so its manifest lists every function; this
            // environment builds last (plugin-rsc: rsc, client, ssr) and
            // gates client-origin calls on the client build's references
            return callerGateModule(
              SERVER_FN_FORWARD_VIRTUAL_ID,
              registry
                .entries()
                .filter((e) => e.clientReferenced)
                .map((e) => e.id),
            )
          }
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
    forwardPlugin,
    resolverPlugin,
  ]
}
