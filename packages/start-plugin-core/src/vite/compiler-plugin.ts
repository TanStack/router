/**
 * Start's Vite host of the compiler core (see the core's README.md,
 * "Hosts"): one `enforce: 'pre'` plugin per Start env compiling every id it is
 * handed text for through ONE `compileModule` (env and derived ids alike)
 * with the planners in the core's fixed order — `start-env`, `hydrate`,
 * `rsc-css`, `router`, `import-edges` — the one
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
  SourceText,
  applyViteInvalidation,
  collectionSizes,
  identify,
  invalidate,
  isAnalyzableSpecifier,
  isFinalBuild,
  liveModules,
  loadDerivedSource,
  normalizePath,
  registerCompilerStats,
  resolveDerivedSibling,
  revision,
  rollupEntryModuleIds,
  warnEagerExports,
} from '@tanstack/router-utils/compiler'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '@tanstack/router-plugin/context'
import { RouteRegistryView } from '@tanstack/router-plugin/planners'
import {
  DEV_CLIENT_ENTRY,
  TRANSFORM_ID_REGEX,
  VITE_ENVIRONMENT_NAMES,
} from '../constants'
import { NODE_MODULES_RE } from '../compiler/scope'
import { StartCompilerSession } from '../compiler/session'
import { decodeDevFunctionId } from '../server-fns/ids'
import { providerModuleId } from '../server-fns/registry'
import {
  SERVER_FN_LOOKUP_VIRTUAL_ID,
  callerGateModule,
  devLookupModule,
  devResolverModule,
  productionResolverModule,
  unreferencedWarning,
} from '../server-fns/resolver'
import { resolveViteEdgeModuleId } from '../import-protection/edge-modules'
import { viteDevGraphView } from '../import-protection/graph-trace'
import {
  discardBundle,
  readRolldownWitness,
  rolldownGraphView,
} from '../import-protection/witness'
import { resolveViteId } from '../utils'
import { createVirtualModule } from './createVirtualModule'
import type { DevCompileOutcome } from '../import-protection/session'
import type { GenerateFunctionId } from '../server-fns/ids'
import type {
  CompileStartFrameworkOptions,
  GetConfigFn,
  StartRscOptions,
} from '../types'
import type { RouterPluginContext } from '@tanstack/router-plugin/context'
import type {
  CompileOutput,
  Diagnostic,
  DiagnosticPosition,
  HostServices,
  InputSourceMap,
  InvalidateChange,
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

interface StartCompilerEnvironment {
  name: string
  type: 'client' | 'server'
  getServerFnById?: string
}

interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<StartCompilerEnvironment>
  generateFunctionId?: GenerateFunctionId
  /** The Vite environment name of the server function provider. */
  providerEnvName: string
  rsc?: StartRscOptions | undefined
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
function toDevSpecifier(id: string, root: string): string {
  const normalizedRoot = normalizePath(root).replace(/\/$/, '')
  const normalized = normalizePath(id)
  if (normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length)
  }
  return normalized.startsWith('/') ? `/@fs${normalized}` : `/@fs/${normalized}`
}

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
  start: StartCompilerSession
  bundledDev: boolean
  /** The app's entry module ids (dev traces start there). */
  entries: Set<string>
}

export function startCompilerPlugin(
  opts: StartCompilerPluginOptions,
): PluginOption {
  const ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
  const envNames = new Set(opts.environments.map((e) => e.name))
  const resolverEnvironments = new Set(
    ssrIsProvider
      ? [opts.providerEnvName]
      : [VITE_ENVIRONMENT_NAMES.server, opts.providerEnvName],
  )
  /**
   * Per-env loaders of genuinely virtual ids (the dev plugin container, or
   * `this.load` in a build): an id is loaded by the environment that
   * resolved it, never asked of another one (in `vite build --watch` the
   * environments build at once, and an id a build cannot load fails it).
   */
  const virtualLoaders = new Map<
    string,
    (id: string) => Promise<string | null>
  >()
  let session: Session | null = null
  let server: ViteDevServer | null = null
  let unsubscribeRoutes: (() => void) | null = null
  /**
   * One compiler invalidation per file event, applied by every env's
   * `hotUpdate`: Vite hands each environment's hook its own context over the
   * event's one `read` function, so the memo lives as long as the event.
   */
  const invalidations = new WeakMap<
    () => unknown,
    Promise<Awaited<ReturnType<typeof invalidate>>>
  >()
  /**
   * Per env: files whose plans an `unlink` evicted or made stale, to
   * re-transform when a file appears (see `applyInvalidation`).
   */
  const awaitingAdd = new Map<string, Set<string>>()
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

  const envOf = (name: string): StartCompilerEnvironment | undefined =>
    opts.environments.find((e) => e.name === name)

  const createSession = (config: {
    root: string
    command: 'serve' | 'build'
    bundledDev: boolean
  }): Session => {
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    const s: Session = {
      start: new StartCompilerSession({
        framework: opts.framework,
        mode: config.command === 'build' ? 'build' : 'dev',
        root: config.root,
        srcDirectory: resolvedStartConfig.srcDirectory,
        environments: opts.environments,
        providerEnv: opts.providerEnvName,
        rsc: opts.rsc,
        generateFunctionId: opts.generateFunctionId,
        codeSplittingOptions: startConfig.router.codeSplittingOptions,
        hmrStyle: 'vite',
        importProtection: startConfig.importProtection,
        isEntry: (p) => entriesOf(s).has(normalizePath(p)),
        routes: new RouteRegistryView(opts.routerPluginContext),
        readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
        loadVirtual: async (id, env) => {
          const load = virtualLoaders.get(env)
          return load ? load(id).catch(() => null) : null
        },
        // pre-bundled dependencies (a Start library declaring the framework
        // as a peer is never pre-bundled): what the optimizer metadata maps
        // back to a source entry is read there (`unoptimizedDependency`)
        opaque: (p) => normalizePath(p).includes('/node_modules/.vite/'),
        label: 'start:vite',
      }),
      bundledDev: config.bundledDev,
      entries: new Set(),
    }
    registerCompilerStats('start:vite:entries', s.entries, (e) => ({
      size: e.size,
    }))
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

  /** Host services bound to one hook context. */
  const hostFor = (
    s: Session,
    environment: Environment,
    resolve: (
      source: string,
      importer?: string,
      options?: { skipSelf?: boolean },
    ) => Promise<{ id: string; external?: boolean | string } | null>,
  ): HostServices =>
    s.start.host(async (specifier, importer) => {
      const r = await resolve(specifier, importer, { skipSelf: true })
      if (!r) {
        return null
      }
      return {
        id: unoptimizedDependency(environment, r.id),
        external: r.external === true || typeof r.external === 'string',
      }
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
   * Applies one invalidation to an env's module graph and returns the
   * dependents (`applyViteInvalidation`; Vite transforms them again and
   * propagates their updates): the changed file's own modules are Vite's own
   * update, and an `unlink`'s dependents wait for the next `add`.
   */
  const applyInvalidation = (
    environment: Environment,
    change: InvalidateChange,
    res: Awaited<ReturnType<typeof invalidate>>,
    timestamp: number,
  ): Array<EnvironmentModuleNode> => {
    let waiting = awaitingAdd.get(environment.name)
    if (!waiting) {
      waiting = new Set()
      awaitingAdd.set(environment.name, waiting)
    }
    return applyViteInvalidation(
      environment as DevEnvironment,
      change,
      res,
      timestamp,
      { ownUpdate: true, awaitingAdd: waiting },
    )
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
    dependents: Array<EnvironmentModuleNode>,
  ): Promise<Array<EnvironmentModuleNode>> => {
    const changed: Array<EnvironmentModuleNode> = []
    for (const node of dependents) {
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
      s.start.caches,
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
    host: HostServices,
  ): Promise<void> => {
    const { registry, rawFacts } = s.start
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
      const facts = await rawFacts.get(identity.canonicalId, env.name)
      if (!facts.targetFacts.exists) {
        continue
      }
      if (!registry.definedIn(identity.canonicalId)) {
        const code = await fs.readFile(identity.path, 'utf8').catch(() => null)
        // the cheap text gate of a module that may define a server function
        if (code !== null && SERVER_FN_TEXT_RE.test(code)) {
          // (the compile registers the module's functions)
          await s.start.compile(
            {
              id: identity.canonicalId,
              code,
              env,
              inputMap: () => null,
              wantMap: false,
            },
            host,
          )
        }
      }
      for (const spec of [
        ...facts.targetFacts.imports,
        ...facts.targetFacts.lazyImports,
      ]) {
        if (rawFacts.isKnownSpecifier(spec) || !isAnalyzableSpecifier(spec)) {
          continue
        }
        const r = await host.resolve(spec, identity.canonicalId)
        if (r && !r.external) {
          queue.push(identify(r.id).canonicalId)
        }
      }
    }
  }

  /** Reports a compile's diagnostics through a hook context (`ctx.error` throws). */
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
    out: CompileOutput,
    filePath: string,
    id: string,
    code: string,
    envType: 'client' | 'server',
  ) => {
    const log = (d: Diagnostic, at: DiagnosticPosition | undefined) => ({
      message: at
        ? `${d.message} (${filePath}:${at.line}:${at.column + 1})`
        : d.message,
      loc: at && { file: filePath, ...at },
    })
    s.start.report(out, filePath, code, envType, {
      error: (d, at) => ctx.error({ ...log(d, at), id }),
      warn: (d, at) => ctx.warn(log(d, at)),
    })
  }

  /**
   * What follows a compile (`StartCompilerSession.afterCompile`): an
   * `error`-behaviour violation fails the module; otherwise the import
   * protection reports whose importers the graph (or the judged edges) can
   * reach now are printed, before the module is served (a host completion
   * event, no microtask polling).
   */
  const afterCompile = (
    s: Session,
    env: StartCompilerEnvironment,
    id: string,
    out: CompileOutput,
    fail: (error: Error) => never,
  ): Promise<void> | undefined => {
    const finish = ({ error }: DevCompileOutcome): void => {
      if (error) {
        fail(error)
      }
      s.start.ip?.env(env.name, env.type).reporter?.flush()
    }
    const outcome = s.start.afterCompile(env, id, out)
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
        if (s.start.ip && environment) {
          const ipEnv = s.start.ip.env(env.name, env.type)
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
          if (!this.meta.watchMode) {
            // a new build: the registry of the previous one is gone (the
            // client builds first; under RSC the rsc provider built before
            // it and allocated its entries first: deterministic, not
            // client-first). A rebuild of `build --watch` keeps it: the
            // server environment rebuilds at the same time and reads it,
            // while the compiles replace their modules' functions (a
            // deleted file's leave at `watchChange`)
            s.start.registry.clear()
          }
          // one warning per file per run
          s.start.warnings.reset()
        }
        if (
          this.environment.mode === 'build' &&
          this.environment.config.build.write !== false &&
          isSeparateProvider(env)
        ) {
          await compileHandlerReach(
            s,
            env,
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
              importer !== undefined && session?.start.ip
                ? session.start.ip.env(env.name, env.type).confirm(edge)
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
            const load = s.start.ip?.load(id)
            return load
              ? { code: load.code, moduleSideEffects: load.moduleSideEffects }
              : null
          }
          return loadDerivedSource(this, id)
        },
      },
      transform: {
        filter: {
          id: { include: TRANSFORM_ID_REGEX, exclude: ASSET_QUERY_RE },
        },
        async handler(code, id) {
          const identity = identify(id)
          const s = requireSession()
          if (
            identity.lang === null ||
            !s.start.compiles(identity.path, code)
          ) {
            return null
          }
          const environment = this.environment
          const out = await s.start.compile(
            {
              id,
              code,
              env,
              inputMap: () => inputMapOf(this, code, identity.path),
              // always: downstream plugins read positions through the combined map, whatever `build.sourcemap` says
              wantMap: true,
            },
            hostFor(s, this.environment, (source, imp, options) =>
              this.resolve(source, imp, options),
            ),
          )
          if (!out) {
            return null
          }
          reportDiagnostics(s, this, out, identity.path, id, code, env.type)
          const decided = afterCompile(s, env, id, out, (error) =>
            this.error(error),
          )
          if (decided) {
            await decided
          }
          if (s.start.opts.mode === 'dev') {
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
        let pending = invalidations.get(ctx.read)
        if (!pending) {
          pending = invalidate(
            s.start.caches,
            change,
            invalidationHosts(s, server, this.environment),
          )
          invalidations.set(ctx.read, pending)
        }
        const res = await pending
        if (ctx.type === 'delete') {
          s.start.forget(normalizePath(ctx.file))
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
            s.start.caches,
            ctx.file,
            ctx.modules,
          )) ?? ctx.modules
        return changed.length > 0 || live !== ctx.modules
          ? [...live, ...changed]
          : undefined
      },
      // The one invalidation of a file event. Bundled dev: applied to every
      // environment's module graph (Vite's `hotUpdate` is not called there;
      // the watching environment's hook applies it). `build --watch`: each
      // environment's watcher reports the files it bundles, and the rebuild
      // compiles their dependents again, against the caches the
      // invalidation left
      async watchChange(id, change) {
        const s = requireSession()
        const environment = this.environment
        if (environment.mode === 'dev' && !(watches && s.bundledDev)) {
          return
        }
        const kind = changeKindOf(change.event)
        if (kind === 'unlink') {
          s.start.forget(normalizePath(id))
        }
        if (environment.mode !== 'dev') {
          await invalidate(
            s.start.caches,
            { path: id, kind },
            hostFor(s, environment, (source, importer, options) =>
              this.resolve(source, importer, options),
            ),
          )
          return
        }
        const res = await invalidate(
          s.start.caches,
          { path: id, kind },
          invalidationHosts(s, server, environment),
        )
        const now = Date.now()
        const environments = server
          ? Object.values(server.environments).filter((e) =>
              envNames.has(e.name),
            )
          : [environment]
        for (const environment of environments) {
          applyInvalidation(environment, { path: id, kind }, res, now)
        }
      },
      renderChunk(code, chunk) {
        const s = requireSession()
        if (!s.start.allocator || !code.includes('__TSS_FN_ID_')) {
          return null
        }
        const patched = s.start.allocateIds(env.type).patch(code)
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
          warnEagerExports(
            rollupEntryModuleIds(bundle as never),
            'rollup',
            s.start.warnings,
            (m) => this.warn(m),
          )
        }
        if (!s.start.ip) {
          return
        }
        const ipEnv = s.start.ip.env(env.name, env.type)
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
          if (s.start.ip) {
            const ipEnv = s.start.ip.env(env.name, env.type)
            ipEnv.beginLogicalBuild()
            await ipEnv.build.runToFixedPoint(async () => {
              output = await original(environment)
            })
          } else {
            output = await original(environment)
          }
          if (isFinalBuild(environment.config.build)) {
            s.start.release(env.name)
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
        if (!s.start.ip || !env || identify(id).lang !== null) {
          return null
        }
        const out = await s.start.compile(
          {
            id,
            code,
            env,
            inputMap: () => inputMapOf(this, code, identify(id).path),
            wantMap: true,
            late: true,
          },
          hostFor(s, this.environment, (source, imp, options) =>
            this.resolve(source, imp, options),
          ),
        )
        if (!out || out.diagnostics.some((d) => d.by === 'parse')) {
          // not JavaScript after all: nothing to judge
          return null
        }
        reportDiagnostics(s, this, out, identify(id).path, id, code, env.type)
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
      const { registry, opts: startOpts } = requireSession().start
      const params = new URLSearchParams(id.slice(lookupPrefix.length))
      const fnId = params.get('id') ?? ''
      let entry = registry.get(fnId)
      if (!entry) {
        // a fresh server: compile the defining module through the normal transform
        const key = decodeDevFunctionId(fnId)
        if (key && this.environment.mode === 'dev') {
          const abs = path.resolve(startOpts.root, key.rootRel)
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
      const specifier = toDevSpecifier(providerModuleId(entry), startOpts.root)
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
              requireSession()
                .start.registry.entries()
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
        entries: requireSession().start.registry.entries(),
        providerModuleId,
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
