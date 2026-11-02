import { realpathSync } from 'node:fs'
import { readFile, readdir, realpath } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  resolve,
} from 'node:path'
import { Generator, resolveConfigPath } from '@tanstack/router-generator'
import { getConfig } from './config'
import { createRouterPluginContext } from './router-plugin-context'
import { normalizePath } from './utils'

import type { GeneratorEvent } from '@tanstack/router-generator'
import type { FSWatcher } from 'chokidar'
import type { UnpluginContextMeta, UnpluginFactory } from 'unplugin'
import type { Config } from './config'
import type { RouterPluginContext } from './router-plugin-context'

const PLUGIN_NAME = 'unplugin:router-generator'

export function createRouterGeneratorPlugin(
  options: Partial<Config | (() => Config)> | undefined = {},
  routerPluginContext: RouterPluginContext,
  framework?: UnpluginContextMeta['framework'],
): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>> {
  let ROOT: string = process.cwd()
  let userConfig: Config
  let generator: Generator

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

  const runGenerator = async (event?: GeneratorEvent) => {
    await generator.run(event)
    const routesByFile = generator.getRoutesByFileMap()
    // Bun resolves symlinks before invoking its module hooks.
    routerPluginContext.routesByFile =
      framework === 'bun'
        ? new Map(
            await Promise.all(
              Array.from(
                routesByFile,
                async ([file, route]) =>
                  [normalizePath(await realpath(file)), route] as const,
              ),
            ),
          )
        : routesByFile
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
      await runGenerator(generatorEvent)
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
    bun: {
      setup(build) {
        initConfigAndGenerator()
        // Reject generation errors instead of bundling a stale route tree.
        build.onStart(() => runGenerator())
        if (
          'reactFastRefresh' in build.config &&
          build.config.reactFastRefresh
        ) {
          const configuredRouteTree = resolve(
            ROOT,
            userConfig.generatedRouteTree,
          )
          const generatedRouteTree = join(
            realpathSync.native(dirname(configuredRouteTree)),
            basename(configuredRouteTree),
          )
          const extension = extname(generatedRouteTree)
          build.onLoad(
            {
              filter: new RegExp(
                `^${generatedRouteTree.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
              ),
            },
            async () => {
              const dependencies = generator.getWatchDependencies()
              // Bun watches immediate directory entries. Include empty directories
              // so a route added there also triggers generation before bundling.
              const watchDirs = await Promise.all(
                dependencies.directories.map(async (directory) => {
                  const entries = await readdir(directory, {
                    recursive: true,
                    withFileTypes: true,
                  })
                  return [
                    directory,
                    ...entries
                      .filter((entry) => entry.isDirectory())
                      .map((entry) => join(entry.parentPath, entry.name)),
                  ]
                }),
              )
              return {
                contents: await readFile(generatedRouteTree, 'utf8'),
                loader:
                  build.config.loader?.[extension] ??
                  (extension === '.tsx'
                    ? 'tsx'
                    : extension === '.jsx'
                      ? 'jsx'
                      : /\.[cm]?ts$/.test(extension)
                        ? 'ts'
                        : 'js'),
                resolveDir: dirname(generatedRouteTree),
                watchDirs: watchDirs.flat(),
                watchFiles: dependencies.files,
              }
            },
          )
        }
      },
    },
    vite: {
      async configResolved(config) {
        initConfigAndGenerator({ root: config.root })
        await generate()
      },
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

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}, meta) => {
  return createRouterGeneratorPlugin(
    options,
    createRouterPluginContext(),
    meta.framework,
  )
}
