import { promises as fsp } from 'node:fs'
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

type GeneratorFs = NonNullable<ConstructorParameters<typeof Generator>[0]['fs']>

// Reads from disk, keeps writes in memory. Used when route generation is
// disabled so the generator can still collect route metadata for the code
// splitter without touching any file.
function createReadOnlyFs(): GeneratorFs {
  const written = new Map<string, { fileContent: string; mtimeMs: bigint }>()
  let clock = 0n
  const stat = async (filePath: string) => {
    const entry = written.get(filePath)
    if (entry) {
      return { mtimeMs: entry.mtimeMs, mode: 0, uid: 0, gid: 0 }
    }
    const res = await fsp.stat(filePath, { bigint: true })
    return {
      mtimeMs: res.mtimeMs,
      mode: Number(res.mode),
      uid: Number(res.uid),
      gid: Number(res.gid),
    }
  }
  return {
    stat,
    readFile: async (filePath) => {
      const entry = written.get(filePath)
      if (entry) {
        return {
          stat: { mtimeMs: entry.mtimeMs },
          fileContent: entry.fileContent,
        }
      }
      try {
        const [fileContent, res] = await Promise.all([
          fsp.readFile(filePath, 'utf8'),
          fsp.stat(filePath, { bigint: true }),
        ])
        return { stat: res, fileContent }
      } catch (e: any) {
        if (e?.code === 'ENOENT') {
          return 'file-not-existing'
        }
        throw e
      }
    },
    writeFile: (filePath, fileContent) => {
      written.set(filePath, { fileContent, mtimeMs: ++clock })
      return Promise.resolve()
    },
    rename: (oldPath, newPath) => {
      const entry = written.get(oldPath)
      if (entry) {
        written.delete(oldPath)
        written.set(newPath, { ...entry, mtimeMs: ++clock })
      }
      return Promise.resolve()
    },
    chmod: async () => {},
    chown: async () => {},
  }
}

export function createRouterGeneratorPlugin(
  options: Partial<Config | (() => Config)> | undefined = {},
  routerPluginContext: RouterPluginContext,
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
      fs:
        userConfig.enableRouteGeneration === false
          ? createReadOnlyFs()
          : undefined,
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
> = (options = {}) => {
  return createRouterGeneratorPlugin(options, createRouterPluginContext())
}
