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
  ASSET_QUERY_RE,
  OWNED_QUERY_RE,
  applyViteInvalidation,
  identify,
  isFinalBuild,
  liveModules,
  loadDerivedSource,
  normalizePath,
  releaseEnvironment,
  resolveDerivedSibling,
  rollupEntryModuleIds,
  warnEagerExports,
} from '@tanstack/router-utils/compiler'
import { getConfig } from '../core/config'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '../core/router-plugin-context'
import { JS_ID_RE, RouterCompiler } from './session'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type {
  Diagnostic,
  DiagnosticPosition,
  ModuleGraphLike,
} from '@tanstack/router-utils/compiler'
import type { Plugin, ViteDevServer } from 'vite'

export const CODE_SPLITTER_PLUGIN_NAME =
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

function logOf(
  d: Diagnostic,
  at: DiagnosticPosition | undefined,
  file: string,
) {
  return at
    ? { message: d.message, id: file, loc: { file, ...at } }
    : { message: d.message, id: file }
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
  let userConfig: Config
  let compiler: RouterCompiler
  let server: ViteDevServer | null = null
  let unsubscribe: (() => void) | null = null
  let firstEnvironment: string | undefined

  const resolveUserConfig = () =>
    typeof options === 'function' ? options() : getConfig(options, ROOT)

  const invalidatePath = async (
    file: string,
    kind: 'change' | 'add' | 'unlink' | 'registry',
  ) => {
    const change = { path: normalizePath(file), kind }
    const res = await compiler.invalidate(change.path, kind)
    if (!server) {
      return
    }
    const now = Date.now()
    for (const environment of Object.values(
      (
        server as unknown as {
          environments: Record<
            string,
            { name: string; moduleGraph: ModuleGraphLike<unknown> }
          >
        }
      ).environments,
    )) {
      applyViteInvalidation(environment, change, res, now)
    }
  }

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
      userConfig = resolveUserConfig()
      compiler = new RouterCompiler({
        context: routerPluginContext,
        config: userConfig,
        bundler: 'vite',
        mode: config.command === 'build' ? 'build' : 'dev',
      })
      unsubscribe?.()
      unsubscribe = onRoutesChanged(routerPluginContext, (next, previous) => {
        for (const file of changedRoutePaths(next, previous)) {
          void invalidatePath(file, 'registry').catch((error: unknown) => {
            server?.config.logger.error(
              `[tanstack-router] invalidating ${file} after a route change failed: ${String(error)}`,
            )
          })
        }
      })

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

    configureServer(viteServer) {
      server = viteServer
      viteServer.httpServer?.once('close', () => {
        unsubscribe?.()
        unsubscribe = null
      })
    },

    buildStart() {
      // one warning per file per run (J2.19): a build of several environments
      // (Vite's builder) starts each in turn; the first configured
      // environment starts the run
      if (
        compiler.mode === 'build' &&
        this.environment.name === firstEnvironment
      ) {
        compiler.warnings.reset()
      }
    },

    closeBundle() {
      if (compiler.mode !== 'build') {
        return
      }
      unsubscribe?.()
      unsubscribe = null
      // the environment's build is finished: its plans go before the next
      // environment builds
      const environment = this.environment
      if (isFinalBuild(environment.config.build)) {
        releaseEnvironment(compiler.caches, environment.name)
      }
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
        compiler.warnings,
        (m) => this.warn(m),
      )
    },

    resolveId: {
      filter: { id: OWNED_QUERY_RE },
      handler(source, importer) {
        return resolveDerivedSibling(source, importer)
      },
    },

    load: {
      filter: { id: OWNED_QUERY_RE },
      handler(id) {
        return compiler.wants(id) ? loadDerivedSource(this, id) : null
      },
    },

    transform: {
      filter: { id: { include: JS_ID_RE, exclude: ASSET_QUERY_RE } },
      async handler(code, id) {
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
        compiler.report(out, file, code, {
          error: (d, at) => this.error(logOf(d, at, identity.path)),
          warn: (d, at) => this.warn(logOf(d, at, identity.path)),
        })
        if (identity.derived === null && out.code === code) {
          return null
        }
        return {
          code: out.code,
          map: out.map,
          moduleSideEffects: out.sideEffectFree ? false : undefined,
        }
      },
    },

    hotUpdate({ file, modules }) {
      // the update is of the modules the file's current plan produces
      return liveModules(this.environment, compiler.caches, file, modules)
    },

    async watchChange(id, { event }) {
      const kind =
        event === 'update' ? 'change' : event === 'create' ? 'add' : 'unlink'
      await invalidatePath(id, kind)
    },
  }
  return plugin
}
