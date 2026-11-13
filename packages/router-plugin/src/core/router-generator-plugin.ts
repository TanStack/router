import { isAbsolute, normalize, relative } from 'node:path'
import {
  Generator,
  createGeneratorSession,
  logging,
  resolveConfigPath,
} from '@tanstack/router-generator'
import { getConfig } from './config'
import {
  createRouterPluginContext,
  publishRoutes,
} from './router-plugin-context'

import type { UnpluginFactory } from 'unplugin'
import type { Config } from './config'
import type { RouterPluginContext } from './router-plugin-context'

const PLUGIN_NAME = 'unplugin:router-generator'

export function createRouterGeneratorPlugin(
  options: Partial<Config | (() => Config)> | undefined = {},
  routerPluginContext: RouterPluginContext,
): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>> {
  let ROOT: string = process.cwd()
  let userConfig: Config
  let generator: Generator
  /** Vite dev: watches the route roots outside Vite's root. */
  let watchOutsideRoot: (() => void) | undefined
  /** Rspack/webpack watch mode: the generator's own watcher reports every route file event. */
  let watching = false
  /** Vite: the config resolution under way was given this plugin (its `config` ran). */
  let submitted = false
  /**
   * Vite build: the warnings the generations of the build's config
   * resolutions printed, so each prints once per build (plugin objects
   * passed inline are given to the top-level resolution and to each
   * environment's, and generate in each). The build's start ends them.
   */
  let printed: Set<string> | undefined
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (routesByFile, failure) => {
      publishRoutes(routerPluginContext, routesByFile, failure)
    },
  })

  const initConfigAndGenerator = (opts?: { root?: string }) => {
    if (opts?.root) {
      ROOT = opts.root
    }
    if (typeof options === 'function') {
      userConfig = options()
    } else {
      userConfig = getConfig(options, ROOT)
    }
    const logger = logging({ disabled: userConfig.disableLogging })
    generator = new Generator({
      config: userConfig,
      root: ROOT,
      logger: {
        ...logger,
        warn: (...args) => {
          const text = args.join(' ')
          if (printed?.has(text)) {
            return
          }
          printed?.add(text)
          logger.warn(...args)
        },
      },
    })
  }

  const isConfigFile = (file: string) =>
    normalize(file) === resolveConfigPath({ configDirectory: ROOT })

  const watchRun = async (compiler: {
    modifiedFiles?: ReadonlySet<string>
    removedFiles?: ReadonlySet<string>
  }) => {
    watching = true
    await session.watchRun(
      compiler.modifiedFiles ?? [],
      compiler.removedFiles ?? [],
    )
  }

  return {
    name: 'tanstack:router-generator',
    enforce: 'pre',
    buildStart() {
      printed = undefined
    },
    async watchChange(id, { event }) {
      if (isConfigFile(id)) {
        initConfigAndGenerator()
        if (watching) {
          await session.close()
          await session.watch()
        }
        watchOutsideRoot?.()
        return
      }
      // (Rspack/webpack: the session hands the compiler's events over itself)
      if (watching) {
        return
      }
      await session.run({ path: normalize(id), type: event })
      watchOutsideRoot?.()
    },
    vite: {
      config() {
        submitted = true
      },
      async configResolved(config) {
        if (config.command === 'build' && !submitted) {
          // Vite shared this plugin into an environment's config resolution
          // of the same build (`builder.sharedPlugins`): it ran `config` on
          // the plugins that resolution was given (the config file's new
          // ones), then swapped in the top-level ones. The top-level
          // resolution generated the tree: same root and options, no file
          // event in between. A plugin object passed inline is given to
          // every resolution, and generates in each.
          return
        }
        submitted = false
        if (config.command === 'build') {
          printed ??= new Set()
        }
        initConfigAndGenerator({ root: config.root })
        await (config.command === 'build' && !config.build.watch
          ? session.build()
          : session.run())
      },
      configureServer(server) {
        // Vite's watcher reports the files under its root (watchChange);
        // the routes may also come from outside it (`physical()` mounts,
        // the virtual route config): those are watched too (SPEC J1.10).
        const addOutsideRoot = () => {
          const { directories, files } = generator.watchTargets()
          const outside = [...directories, ...files].filter((target) => {
            const fromRoot = relative(server.config.root, target)
            return fromRoot.startsWith('..') || isAbsolute(fromRoot)
          })
          if (outside.length) {
            server.watcher.add(outside)
          }
        }
        addOutsideRoot()
        watchOutsideRoot = addOutsideRoot
      },
    },
    rspack(compiler) {
      initConfigAndGenerator()
      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => session.build())
      // The compiler's watcher sees the files of the bundle only: route files
      // created, or outside the bundle (unparsable, `physical()` mounts), come
      // from the generator's own watcher.
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, watchRun)
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void session.close()
      })
    },
    webpack(compiler) {
      initConfigAndGenerator()
      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => session.build())
      // See rspack above
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, watchRun)
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void session.close()
      })
      compiler.hooks.done.tap(PLUGIN_NAME, () => {
        console.info('✅ ' + PLUGIN_NAME + ': route-tree generation done')
      })
    },
    esbuild: {
      config() {
        initConfigAndGenerator()
      },
      // Every build and rebuild (esbuild watches the files of the bundle
      // only, and reports no file events to plugins: `watchChange` never
      // runs)
      setup(build) {
        build.onStart(() => session.build())
      },
    },
  }
}

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}) => {
  return createRouterGeneratorPlugin(options, createRouterPluginContext())
}
