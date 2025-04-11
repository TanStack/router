import { isAbsolute, join, normalize, resolve } from 'node:path'
import { generator, resolveConfigPath } from '@tanstack/router-generator'

import { getConfig } from './config'
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
      configResolved(config) {
        ROOT = config.root
        userConfig = getConfig(options, ROOT)

        // if (config.command === 'serve') {
        //   await run(generate)
        // }
      },
      async buildStart() {
        if (this.environment.name === 'server') {
          // When building in environment mode, we only need to generate routes
          // for the client environment
          return
        }
        await run(generate)
      },
      sharedDuringBuild: true,
    },
    async rspack(compiler) {
      userConfig = getConfig(options, ROOT)

      if (compiler.options.mode === 'production') {
        compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
          await run(generate)
        })
      } else {
        // rspack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', async () => {
            await run(generate)
          })

        let generated = false
        compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
          if (!generated) {
            generated = true
            return run(generate)
          }
        })
      }
    },
    async webpack(compiler) {
      userConfig = getConfig(options, ROOT)

      if (compiler.options.mode === 'production') {
        compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
          await run(generate)
        })
      } else {
        // webpack watcher doesn't register newly created files
        const routesDirectoryPath = getRoutesDirectoryPath()
        const chokidar = await import('chokidar')
        chokidar
          .watch(routesDirectoryPath, { ignoreInitial: true })
          .on('add', async () => {
            await run(generate)
          })

        let generated = false
        compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
          if (!generated) {
            generated = true
            return run(generate)
          }
        })
      }

      if (compiler.options.mode === 'production') {
        compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
          console.info('✅ ' + PLUGIN_NAME + ': route-tree generation done')
          setTimeout(() => {
            process.exit(0)
          })
        })
      }
    },
  }
}
