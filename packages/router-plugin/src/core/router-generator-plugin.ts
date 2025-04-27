import { isAbsolute, join, normalize, resolve } from 'node:path'
import { generator, resolveConfigPath } from '@tanstack/router-generator'

import { getConfig } from './config'
import type { FSWatcher } from 'chokidar'
import type { UnpluginFactory } from 'unplugin'
import type { Config } from './config'

let lock = false
const checkLock = () => lock
const setLock = (bool: boolean) => {
  lock = bool
}

const PLUGIN_NAME = 'unplugin:router-generator'

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}) => {
  let ROOT: string = process.cwd()
  let userConfig = options as Config

  const getRoutesDirectoryPath = () => {
    return isAbsolute(userConfig.routesDirectory)
      ? userConfig.routesDirectory
      : join(ROOT, userConfig.routesDirectory)
  }

  const generate = async () => {
    if (checkLock()) {
      return
    }

    setLock(true)

    try {
      await generator(userConfig, process.cwd())
    } catch (err) {
      console.error(err)
      console.info()
    } finally {
      setLock(false)
    }
  }

  const handleFile = async (
    file: string,
    event: 'create' | 'update' | 'delete',
  ) => {
    const filePath = normalize(file)

    if (filePath === resolveConfigPath({ configDirectory: ROOT })) {
      userConfig = getConfig(options, ROOT)
      return
    }

    if (
      event === 'update' &&
      filePath === resolve(userConfig.generatedRouteTree)
    ) {
      // skip generating routes if the generated route tree is updated
      return
    }

    const routesDirectoryPath = getRoutesDirectoryPath()
    if (filePath.startsWith(routesDirectoryPath)) {
      await generate()
    }
  }

  const run: (cb: () => Promise<void> | void) => Promise<void> = async (cb) => {
    if (userConfig.enableRouteGeneration ?? true) {
      await cb()
    }
  }

  return {
    name: 'router-generator-plugin',
    async watchChange(id, { event }) {
      await run(async () => {
        await handleFile(id, event)
      })
    },
    vite: {
      async configResolved(config) {
        ROOT = config.root
        userConfig = getConfig(options, ROOT)

        await run(generate)
      },
    },
    rspack(compiler) {
      userConfig = getConfig(options, ROOT)

      let handle: FSWatcher | null = null

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
        await run(generate)
      })

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (handle) {
          return
        }

        // rspack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        handle = chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', async () => {
            await run(generate)
          })

        await run(generate)
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
        if (handle) {
          await handle.close()
        }
      })
    },
    webpack(compiler) {
      userConfig = getConfig(options, ROOT)

      let handle: FSWatcher | null = null

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
        await run(generate)
      })

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (handle) {
          return
        }

        // webpack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        handle = chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', async () => {
            await run(generate)
          })

        await run(generate)
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
