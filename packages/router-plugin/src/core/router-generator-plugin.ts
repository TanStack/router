import { isAbsolute, join, normalize } from 'node:path'
import { Generator, resolveConfigPath } from '@tanstack/router-generator'
import { getConfig } from './config'

import type { GeneratorEvent } from '@tanstack/router-generator'
import type { FSWatcher } from 'chokidar'
import type { UnpluginFactory } from 'unplugin'
import type { Config } from './config'

const PLUGIN_NAME = 'unplugin:router-generator'

// Physical mounts that point outside `routesDirectory` — their files aren't
// covered by the bundler's own watcher.
function getExternalPhysicalDirs(
  generator: Generator,
  routesDirectoryPath: string,
): Array<string> {
  return generator
    .getPhysicalDirectories()
    .filter((dir) => !dir.startsWith(routesDirectoryPath))
}

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}) => {
  let ROOT: string = process.cwd()
  let userConfig: Config
  let generator: Generator

  const routeGenerationDisabled = () =>
    userConfig.enableRouteGeneration === false
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
    vite: {
      async configResolved(config) {
        initConfigAndGenerator({ root: config.root })
        await generate()
      },
      configureServer(server) {
        const external = getExternalPhysicalDirs(
          generator,
          getRoutesDirectoryPath(),
        )
        if (external.length === 0) return
        for (const dir of external) {
          server.watcher.add(dir)
        }
        const onEvent =
          (event: 'create' | 'update' | 'delete') => (file: string) => {
            if (!external.some((dir) => file.startsWith(dir))) return
            void generate({ file, event })
          }
        server.watcher.on('add', onEvent('create'))
        server.watcher.on('change', onEvent('update'))
        server.watcher.on('unlink', onEvent('delete'))
      },
    },
    rspack(compiler) {
      initConfigAndGenerator()

      let handle: FSWatcher | null = null
      let externalHandle: FSWatcher | null = null

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

        // External physical() mounts are outside rspack's file graph.
        const external = getExternalPhysicalDirs(generator, routesDirectoryPath)
        if (external.length > 0) {
          externalHandle = chokidar
            .watch(external, { ignoreInitial: true })
            .on('add', (file) => generate({ file, event: 'create' }))
            .on('change', (file) => generate({ file, event: 'update' }))
            .on('unlink', (file) => generate({ file, event: 'delete' }))
        }

        await generate()
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
        if (handle) await handle.close()
        if (externalHandle) await externalHandle.close()
      })
    },
    webpack(compiler) {
      initConfigAndGenerator()

      let handle: FSWatcher | null = null
      let externalHandle: FSWatcher | null = null

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

        // External physical() mounts are outside webpack's file graph.
        const external = getExternalPhysicalDirs(generator, routesDirectoryPath)
        if (external.length > 0) {
          externalHandle = chokidar
            .watch(external, { ignoreInitial: true })
            .on('add', (file) => generate({ file, event: 'create' }))
            .on('change', (file) => generate({ file, event: 'update' }))
            .on('unlink', (file) => generate({ file, event: 'delete' }))
        }

        await generate()
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
        if (handle) await handle.close()
        if (externalHandle) await externalHandle.close()
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
