import { isAbsolute, normalize, relative } from 'node:path'
import {
  Generator,
  createGeneratorSession,
  resolveConfigPath,
} from '@tanstack/router-generator'
import { getConfig } from './config'
import { createRouterPluginContext } from './router-plugin-context'

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
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (routesByFile) => {
      routerPluginContext.routesByFile = routesByFile
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
    generator = new Generator({
      config: userConfig,
      root: ROOT,
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
      async configResolved(config) {
        initConfigAndGenerator({ root: config.root })
        await session.run()
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
      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => session.run())
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
      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => session.run())
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
    },
  }
}

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}) => {
  return createRouterGeneratorPlugin(options, createRouterPluginContext())
}
