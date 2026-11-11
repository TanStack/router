import { isAbsolute, join, normalize } from 'node:path'
import { Generator, resolveConfigPath } from '@tanstack/router-generator'
import { getConfig } from './config'
import { createRouterPluginContext } from './router-plugin-context'

import type { GeneratorEvent } from '@tanstack/router-generator'
import type { FSWatcher } from 'chokidar'
import type { UnpluginFactory } from 'unplugin'
import type { Config } from './config'
import type { RouterPluginContext } from './router-plugin-context'

const PLUGIN_NAME = 'unplugin:router-generator'

/** The compiler hooks the generator taps; webpack and Rspack share them. */
interface WatchingCompiler {
  hooks: {
    beforeRun: { tapPromise: (name: string, fn: () => Promise<void>) => void }
    watchRun: { tapPromise: (name: string, fn: () => Promise<void>) => void }
    watchClose: { tap: (name: string, fn: () => Promise<void>) => void }
  }
}

export function createRouterGeneratorPlugin(
  options: Partial<Config | (() => Config)> | undefined = {},
  routerPluginContext: RouterPluginContext,
): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>> {
  let ROOT: string = process.cwd()
  let userConfig: Config
  let generator: Generator
  // Route modules: files outside the routes directory that change the route
  // tree (package.json, manifests of mounted modules). Watchers add them.
  let watchRouteModuleFiles: ((files: Array<string>) => void) | undefined

  const getRoutesDirectoryPath = () => {
    return isAbsolute(userConfig.routesDirectory)
      ? userConfig.routesDirectory
      : join(ROOT, userConfig.routesDirectory)
  }

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

  const generate = async (opts?: {
    file: string
    event: 'create' | 'update' | 'delete'
  }) => {
    let generatorEvent: GeneratorEvent | undefined = undefined
    if (opts) {
      const filePath = normalize(opts.file)
      if (filePath === resolveConfigPath({ configDirectory: ROOT })) {
        initConfigAndGenerator()
        return
      }
      generatorEvent = { path: filePath, type: opts.event }
    }

    try {
      await generator.run(generatorEvent)
      routerPluginContext.routesByFile = generator.getRoutesByFileMap()
      watchRouteModuleFiles?.(generator.getRouteModuleWatchFiles())
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * Generates before a build and on watch runs. The bundler's watcher does not
   * register newly created files, so a chokidar watcher over the routes
   * directory and the route-module files drives the generator while watching.
   */
  const generateWithCompiler = (compiler: WatchingCompiler) => {
    initConfigAndGenerator()

    let handle: FSWatcher | null = null

    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate())

    compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
      if (handle) {
        return
      }

      const chokidar = await import('chokidar')
      const watcher = chokidar
        .watch(getRoutesDirectoryPath(), { ignoreInitial: true })
        .on('add', (file) => generate({ file, event: 'create' }))
        .on('change', (file) => {
          if (generator.getRouteModuleWatchFiles().includes(file)) {
            return generate({ file, event: 'update' })
          }
          return undefined
        })
      handle = watcher
      watchRouteModuleFiles = (files) => {
        if (files.length) {
          watcher.add(files)
        }
      }
      watchRouteModuleFiles(generator.getRouteModuleWatchFiles())

      await generate()
    })

    compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
      if (handle) {
        await handle.close()
      }
    })
  }

  return {
    name: 'tanstack:router-generator',
    enforce: 'pre',
    async watchChange(id, { event }) {
      await generate({
        file: id,
        event,
      })
    },
    vite: {
      async configResolved(config) {
        initConfigAndGenerator({ root: config.root })
        await generate()
      },
      configureServer(server) {
        watchRouteModuleFiles = (files) => {
          if (files.length) {
            server.watcher.add(files)
          }
        }
        watchRouteModuleFiles(generator.getRouteModuleWatchFiles())
      },
    },
    rspack(compiler) {
      generateWithCompiler(compiler)
    },
    webpack(compiler) {
      generateWithCompiler(compiler)
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
