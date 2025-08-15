import { isAbsolute, join, normalize } from 'node:path'
import { Generator, resolveConfigPath } from '@tanstack/router-generator'
import { getConfig } from './config'

import type { GeneratorEvent } from '@tanstack/router-generator'
import type { FSWatcher } from 'chokidar'
import type { UnpluginFactory } from 'unplugin'
import type { Config } from './config'

const PLUGIN_NAME = 'unplugin:router-generator'

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}) => {
  const ROOT: string = process.cwd()
  let userConfig = options as Config
  let generator: Generator

  const routeGenerationDisabled = () =>
    userConfig.enableRouteGeneration === false
  const getRoutesDirectoryPath = () => {
    return isAbsolute(userConfig.routesDirectory)
      ? userConfig.routesDirectory
      : join(ROOT, userConfig.routesDirectory)
  }

  const initConfigAndGenerator = () => {
    userConfig = getConfig(options, ROOT)
    generator = new Generator({
      config: userConfig,
      root: ROOT,
    })
  }

  const generate = async (opts?: {
    file: string
    event: 'create' | 'update' | 'delete'
  }) => {
    if (routeGenerationDisabled()) {
      return
    }
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
      globalThis.TSR_ROUTES_BY_ID_MAP = generator.getRoutesByFileMap()
    } catch (e) {
      console.error(e)
    }
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
    async buildStart() {
      await generate()
    },
    vite: {
      configResolved() {
        initConfigAndGenerator()
      },
      applyToEnvironment(environment) {
        if (userConfig.plugin?.vite?.environmentName) {
          return userConfig.plugin.vite.environmentName === environment.name
        }
        return true
      },
      async buildStart() {
        await generate()
      },
      sharedDuringBuild: true,
    },
    rspack(compiler) {
      initConfigAndGenerator()

      let handle: FSWatcher | null = null

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate())

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (handle) {
          return
        }

        // rspack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        handle = chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', (file) => generate({ file, event: 'create' }))

        await generate()
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
        if (handle) {
          await handle.close()
        }
      })
    },
    webpack(compiler) {
      initConfigAndGenerator()

      let handle: FSWatcher | null = null

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate())

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (handle) {
          return
        }

        // webpack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        handle = chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', (file) => generate({ file, event: 'create' }))

        await generate()
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
        if (handle) {
          await handle.close()
        }
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
