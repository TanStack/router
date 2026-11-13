/**
 * Vite host of the router compiler (see the compiler README, "Hosts"): one native plugin per
 * compiler instance with hook filters. `transform` compiles every id of a
 * route module it is handed text for (the env id and the derived
 * `?tsr-split=` ids alike, from the text the bundler hands it, so upstream
 * transforms and maps apply to every id); `resolveId` resolves the owned-query
 * specifiers of the glue without touching the file system; `watchChange`
 * is the one invalidation operation; diagnostics go through the warning
 * ledger to `this.warn`. Dev or build is the bundler's command, never
 * `process.env.NODE_ENV`, which is unset or wrong in many setups.
 */
import path from 'node:path'
import {
  OWNED_QUERY_RE,
  SAME_FILE_SPECIFIER_RE,
  SCRIPT_ASSET_QUERY_RE,
  ViteRunSessions,
  displayPath,
  identify,
  isFinalBuild,
  loadDerivedSource,
  normalizePath,
  releaseEnvironment,
  reloadStaleModules,
  resolveSameFileSpecifier,
  rollupEntryModuleIds,
  staleHotUpdate,
  viteLog,
  warnEagerExports,
  watchDependencies,
  withOwnSourcesNamedByFile,
} from '@tanstack/router-utils/compiler'
import { getConfig } from '../core/config'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '../core/router-plugin-context'
import { JS_ID_RE, RouterCompiler } from './session'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'

const CODE_SPLITTER_PLUGIN_NAME =
  'tanstack-router:code-splitter:compile-reference-file'

type TransformationPluginInfo = {
  pluginNames: Array<string>
  pkg: string
  usage: string
}

/**
 * JSX transformation plugins grouped by framework.
 * These plugins must come AFTER the TanStack Router plugin in the Vite config.
 */
const TRANSFORMATION_PLUGINS_BY_FRAMEWORK: Record<
  string,
  Array<TransformationPluginInfo>
> = {
  react: [
    {
      // Babel-based React plugin
      pluginNames: ['vite:react-babel', 'vite:react-refresh'],
      pkg: '@vitejs/plugin-react',
      usage: 'react()',
    },
    {
      // SWC-based React plugin
      pluginNames: ['vite:react-swc', 'vite:react-swc:resolve-runtime'],
      pkg: '@vitejs/plugin-react-swc',
      usage: 'reactSwc()',
    },
    {
      // OXC-based React plugin (deprecated but should still be handled)
      pluginNames: ['vite:react-oxc:config', 'vite:react-oxc:refresh-runtime'],
      pkg: '@vitejs/plugin-react-oxc',
      usage: 'reactOxc()',
    },
  ],
  solid: [
    {
      pluginNames: ['solid'],
      pkg: 'vite-plugin-solid',
      usage: 'solid()',
    },
  ],
}

export type RouterPluginOptions = Partial<Config | (() => Config)> | undefined

/** The plugin's state of one build run or dev server (`ViteRunSessions`). */
interface Session {
  compiler: RouterCompiler
  server: ViteDevServer | null
  /** Stops the session's route registry listener. */
  unsubscribe: () => void
}

/**
 * The router compiler as a Vite plugin: route splitting (`autoCodeSplitting`)
 * and route HMR (`codeSplittingOptions.addHmr`, dev client envs only).
 */
export function createRouterCompilerVitePlugin(
  options: RouterPluginOptions = {},
  routerPluginContext: RouterPluginContext,
): Plugin {
  let ROOT: string = process.cwd()
  let bundledDev = false
  let userConfig: Config
  let firstEnvironment: string | undefined

  const resolveUserConfig = () =>
    typeof options === 'function' ? options() : getConfig(options, ROOT)

  /** A file event's or a registry change's invalidation; a failure is the dev server's to print. */
  const invalidatePath = (
    s: Session,
    file: string,
    kind: 'change' | 'add' | 'unlink' | 'registry',
  ) =>
    s.compiler.invalidate(normalizePath(file), kind).then(
      () => undefined,
      (error: unknown) => {
        s.server?.config.logger.error(
          `[tanstack-router] invalidating ${file} after a file change failed: ${String(error)}`,
        )
      },
    )

  /**
   * Outside a hot update (a registry change, a dev server without HMR):
   * every environment's stale set, sent as updates (`reloadStaleModules`).
   */
  const reloadStale = (s: Session, held: boolean) => {
    for (const environment of Object.values(s.server?.environments ?? {})) {
      reloadStaleModules(
        s.compiler.caches,
        environment,
        held,
        '[tanstack-router]',
      )
    }
  }

  const sessions = new ViteRunSessions<Session, ResolvedConfig, ViteDevServer>(
    (config, server) => {
      const s: Session = {
        compiler: new RouterCompiler({
          context: routerPluginContext,
          config: userConfig,
          root: config.root,
          bundler: 'vite',
          mode: config.command === 'build' ? 'build' : 'dev',
        }),
        server,
        unsubscribe: () => {},
      }
      // a registry change (the generator published new route ids) re-plans
      // the route modules concerned
      // (a dev server's environments hold modules: a registry change stales
      // its file there whether or not a plan of it exists)
      for (const environment of Object.keys(server?.environments ?? {})) {
        s.compiler.caches.stale.track(environment)
      }
      s.unsubscribe = onRoutesChanged(routerPluginContext, (next, previous) => {
        const files = changedRoutePaths(next, previous).map(normalizePath)
        void Promise.all(
          files.map((file) => invalidatePath(s, file, 'registry')),
        ).then(() => reloadStale(s, false))
      })
      return s
    },
    '[tanstack-router] the router plugin',
  )

  const plugin: Plugin = {
    name: CODE_SPLITTER_PLUGIN_NAME,
    enforce: 'pre',

    config(userViteConfig) {
      ROOT = path.resolve(userViteConfig.root ?? process.cwd())
      // The dev-only route HMR block imports the framework's `/hmr` subpath,
      // which no source file imports: pre-bundle it with the package rather
      // than discovering it on the first route module (a re-optimization and
      // a page reload).
      return {
        optimizeDeps: {
          include: [`@tanstack/${resolveUserConfig().target}-router/hmr`],
        },
      }
    },

    configResolved(config) {
      firstEnvironment = Object.keys(config.environments)[0]
      ROOT = config.root
      bundledDev =
        config.command === 'serve' &&
        !!(config.experimental as { bundledDev?: boolean } | undefined)
          ?.bundledDev
      userConfig = resolveUserConfig()

      // Validate plugin order - router must come before JSX transformation
      // plugins. Only route splitting needs the route file's source: without
      // it (`autoCodeSplitting: false`) the route HMR block is appended to
      // whatever the framework plugin emitted, so the order is free.
      if (!userConfig.autoCodeSplitting) {
        return
      }
      const routerPluginIndex = config.plugins.findIndex(
        (p) => p.name === CODE_SPLITTER_PLUGIN_NAME,
      )
      if (routerPluginIndex === -1) {
        return
      }
      const frameworkPlugins =
        TRANSFORMATION_PLUGINS_BY_FRAMEWORK[userConfig.target]
      if (!frameworkPlugins) {
        return
      }
      for (const transformPlugin of frameworkPlugins) {
        const transformPluginIndex = config.plugins.findIndex((p) =>
          transformPlugin.pluginNames.includes(p.name),
        )
        if (
          transformPluginIndex !== -1 &&
          transformPluginIndex < routerPluginIndex
        ) {
          throw new Error(
            `Plugin order error: '${transformPlugin.pkg}' is placed before '@tanstack/router-plugin'.\n\n` +
              `The TanStack Router plugin must come BEFORE JSX transformation plugins.\n\n` +
              `Please update your Vite config:\n\n` +
              `  plugins: [\n` +
              `    tanstackRouter(),\n` +
              `    ${transformPlugin.usage},\n` +
              `  ]\n`,
          )
        }
      }
    },

    applyToEnvironment(environment) {
      if (userConfig.plugin?.vite?.environmentName) {
        return userConfig.plugin.vite.environmentName === environment.name
      }
      return true
    },

    // a builder's run (before any other plugin builds an environment; Vite 7+)
    buildApp: {
      order: 'pre',
      handler(builder) {
        sessions.ofRun(builder.environments, builder.config, null)
        return Promise.resolve()
      },
    },

    configureServer(viteServer) {
      sessions.ofRun(viteServer.environments, viteServer.config, viteServer)
    },

    buildStart() {
      // one warning per file per run (J2.19): a build of several environments
      // (Vite's builder) starts each in turn; the first configured
      // environment starts the run
      const s = sessions.of(this.environment)
      const { compiler } = s
      if (
        compiler.mode === 'build' &&
        this.environment.name === firstEnvironment
      ) {
        compiler.warnings.reset()
      }
      if (compiler.mode === 'build' && this.meta.watchMode) {
        // a watch rebuild compiles every module again (Rolldown runs every
        // `load` and `transform`): the environment's stale set is built
        compiler.caches.stale.take(this.environment.name, { held: true })
      }
    },

    /**
     * A dev server calls it when it closes (or restarts): its session stops
     * listening. A build's environment is finished: its plans go before the
     * next environment builds.
     */
    closeBundle() {
      const environment = this.environment
      const s = sessions.peek(environment)
      if (!s) {
        return
      }
      s.unsubscribe()
      if (
        s.compiler.mode === 'build' &&
        isFinalBuild(environment.config.build)
      ) {
        releaseEnvironment(s.compiler.caches, environment.name)
      }
    },

    // a split chunk's map names the route file, not `route.tsx?tsr-split=…`
    outputOptions(options) {
      return withOwnSourcesNamedByFile(options)
    },

    generateBundle(_options, bundle) {
      if (this.environment.config.consumer !== 'client') {
        return
      }
      // an extracted-export output an entry chunk (or a chunk it imports
      // statically) holds is eager whatever the splitter did: say so (J2.8)
      warnEagerExports(
        rollupEntryModuleIds(bundle),
        'rollup',
        sessions.of(this.environment).compiler.warnings,
        (m) => this.warn(m),
        (id) => this.getModuleInfo(id)?.importers ?? [],
        { root: ROOT, routeTree: userConfig.generatedRouteTree },
      )
    },

    resolveId: {
      filter: { id: SAME_FILE_SPECIFIER_RE },
      handler(source, importer) {
        return resolveSameFileSpecifier(source, importer)
      },
    },

    load: {
      filter: { id: OWNED_QUERY_RE },
      handler(id) {
        return sessions.of(this.environment).compiler.wants(id)
          ? loadDerivedSource(this, id)
          : null
      },
    },

    transform: {
      filter: { id: { include: JS_ID_RE, exclude: SCRIPT_ASSET_QUERY_RE } },
      async handler(code, id) {
        const s = sessions.of(this.environment)
        const { compiler } = s
        if (!compiler.wants(id)) {
          return null
        }
        const identity = identify(id)
        if (identity.lang === null) {
          return null
        }
        const file = normalizePath(identity.path)
        const entry = compiler.routeEntry(file)
        if (!entry) {
          // a derived id of a file that is no longer a route module (J2.13)
          return identity.derived
            ? { code: 'export {}\n', map: { mappings: '' } }
            : null
        }
        const environment = this.environment
        const envType = environment.config.consumer
        if (!compiler.appliesTo(envType)) {
          return null
        }
        const wantMap =
          compiler.mode === 'dev' ||
          environment.config.build.sourcemap !== false
        const out = await compiler.compile({
          id,
          code,
          env: { name: environment.name, type: envType },
          wantMap,
        })
        if (!out) {
          return null
        }
        watchDependencies(this, out.dependencies, file)
        const name = displayPath(identity.path, ROOT)
        // Vite's dev transform context maps `loc`; bundled dev's (Rolldown's) does not
        const dev = compiler.mode === 'dev' && !bundledDev
        compiler.report(out, file, code, {
          error: (d, at) =>
            this.error(viteLog(d.message, at, code, name, identity.path, dev)),
          warn: (d, at) =>
            this.warn(viteLog(d.message, at, code, name, identity.path, dev)),
        })
        if (identity.derived === null && out.code === code) {
          return null
        }
        return {
          code: out.code,
          map: out.map,
          // an extracted export's module runs nothing of its own: a bundler
          // may skip it while nothing imports what it exports (the
          // webpack-family hosts' rule on the query)
          moduleSideEffects:
            identity.derived?.kind === 'export' ? false : undefined,
        }
      },
    },

    /**
     * Design 3's hook: the event's invalidation, then the environment's
     * stale set handed to Vite with the event's own modules (those the
     * file's current plan produces). A creation takes the paths held since
     * a removal. A path that enters the set after the take waits for the
     * next event's hook.
     */
    hotUpdate({ file, modules, type }) {
      const s = sessions.of(this.environment)
      const kind =
        type === 'update' ? 'change' : type === 'create' ? 'add' : 'unlink'
      return staleHotUpdate(
        this.environment,
        s.compiler.caches,
        { path: normalizePath(file), kind },
        modules,
        () => invalidatePath(s, file, kind),
      )
    },

    // where Vite calls no `hotUpdate`: a build's watcher (`vite build
    // --watch`), bundled dev and a dev server without HMR
    async watchChange(id, { event }) {
      const s = sessions.of(this.environment)
      if (
        this.environment.mode === 'dev' &&
        !bundledDev &&
        s.server?.config.server.hmr !== false
      ) {
        return
      }
      const kind =
        event === 'update' ? 'change' : event === 'create' ? 'add' : 'unlink'
      await invalidatePath(s, id, kind)
      reloadStale(s, kind === 'add')
    },
  }
  return plugin
}
