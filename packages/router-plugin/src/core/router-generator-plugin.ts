import { isAbsolute, join, normalize } from 'node:path'
import { Generator, resolveConfigPath } from '@tanstack/router-generator'

import { getConfig } from './config'
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

  const generate = async () => {
    if (routeGenerationDisabled()) {
      return
    }
    try {
      await generator.run()
    } catch (e) {
      console.error(e)
    }
  }

  const handleFile = async (
    file: string,
    event: 'create' | 'update' | 'delete',
  ) => {
    const filePath = normalize(file)

    if (filePath === resolveConfigPath({ configDirectory: ROOT })) {
      initConfigAndGenerator()
      return
    }
    try {
      await generator.run({ path: filePath, type: event })
    } catch (e) {
      console.error(e)
    }
  }

  return {
    name: 'router-generator-plugin',
    enforce: 'pre',
    async watchChange(id, { event }) {
      if (!routeGenerationDisabled()) {
        await handleFile(id, event)
      }
    },
    async buildStart() {
      await generate()
    },
    vite: {
      configResolved() {
        initConfigAndGenerator()
      },
      async buildStart() {
        if (this.environment.config.consumer === 'server') {
          // When building in environment mode, we only need to generate routes
          // for the client environment
          return
        }
        await generate()
      },
      sharedDuringBuild: true,
    },
    rspack(compiler) {
      initConfigAndGenerator()

      let handle: FSWatcher | null = null

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, generate)

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (handle) {
          return
        }

        // rspack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        handle = chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', generate)

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

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, generate)

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (handle) {
          return
        }

        // webpack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        handle = chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', generate)

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
  }
}
