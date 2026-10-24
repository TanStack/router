import { isAbsolute, normalize, relative } from 'node:path'
import {
  Generator,
  resolveConfigPath,
  watchRouteFiles,
} from '@tanstack/router-generator'
import { getConfig } from './config'
import { createRouterPluginContext } from './router-plugin-context'

import type {
  GeneratorEvent,
  RouteFileWatcher,
} from '@tanstack/router-generator'
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
  /** Rspack/webpack: the generator's own watcher reports every route file event. */
  let ownWatcher: Promise<RouteFileWatcher> | undefined
  /** Vite dev: watches the route roots outside Vite's root. */
  let watchOutsideRoot: (() => void) | undefined

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

  const settle = async (run: Promise<void>) => {
    try {
      await run
      routerPluginContext.routesByFile = generator.getRoutesByFileMap()
    } catch (e) {
      console.error(e)
    }
  }

  const generate = async (opts?: {
    file: string
    event: 'create' | 'update' | 'delete'
  }) => {
    let generatorEvent: GeneratorEvent | undefined = undefined
    if (opts) {
      const filePath = normalize(opts.file)
      if (filePath === resolveConfigPath({ configDirectory: ROOT })) {
        initConfigAndGenerator()
        if (ownWatcher) {
          await closeOwnWatcher()
          await watchOwnFiles()
        }
        return
      }
      generatorEvent = { path: filePath, type: opts.event }
    }
    await settle(generator.run(generatorEvent))
  }

  const watchOwnFiles = async () => {
    ownWatcher ??= watchRouteFiles(generator, (run) => void settle(run))
    await (
      await ownWatcher
    ).ready
  }

  const closeOwnWatcher = async () => {
    const watcher = ownWatcher
    ownWatcher = undefined
    await (await watcher)?.close()
  }

  return {
    name: 'tanstack:router-generator',
    enforce: 'pre',
    async watchChange(id, { event }) {
      if (
        ownWatcher &&
        normalize(id) !== resolveConfigPath({ configDirectory: ROOT })
      ) {
        return
      }
      await generate({
        file: id,
        event,
      })
      watchOutsideRoot?.()
    },
    vite: {
      async configResolved(config) {
        initConfigAndGenerator({ root: config.root })
        await generate()
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

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate())

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (ownWatcher) {
          return
        }
        // The compiler's watcher sees the files of the bundle only: route
        // files created, or outside the bundle (unparsable, `physical()`
        // mounts), come from the generator's own watcher.
        await generate()
        await watchOwnFiles()
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void closeOwnWatcher()
      })
    },
    webpack(compiler) {
      initConfigAndGenerator()

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate())

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (ownWatcher) {
          return
        }
        // See rspack above
        await generate()
        await watchOwnFiles()
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void closeOwnWatcher()
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
