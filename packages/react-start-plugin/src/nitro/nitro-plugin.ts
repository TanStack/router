import { platform } from 'node:os'
import path from 'node:path'
import { build, createNitro } from 'nitropack'
import { normalizePath } from 'vite'

import { dirname, resolve } from "pathe";
import { getRollupConfig } from 'nitropack/rollup'
import { buildNitroEnvironment } from '@tanstack/start-plugin-core'
import { clientDistDir, ssrEntryFile } from '../index.js'
import { prerender } from '../prerender.js'
import { devServerPlugin } from './dev-server-plugin.js'
import type { EnvironmentOptions, PluginOption, Rollup } from 'vite'
import type { Nitro, NitroConfig } from 'nitropack'
import type { TanStackStartOutputConfig } from '../schema.js'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from '../schema.js'

const isWindows = platform() === 'win32'
const filePrefix = isWindows ? 'file:///' : ''

export function nitroPlugin(
  options: TanStackStartOutputConfig,
  getSsrBundle: () => Rollup.OutputBundle,
): Array<PluginOption> {

  const buildPreset =
    process.env['START_TARGET'] ?? (options.target as string | undefined)

  return [
    devServerPlugin(options),
    {
      name: 'tanstack-vite-plugin-nitro',
      async configEnvironment(name) {
        if (name === 'server') {
          return {
            build: {
              commonjsOptions: {
                include: [],
              },
              ssr: true,
              sourcemap: true,
              rollupOptions: {
                input: options.serverEntryPath,
              },
            },
          } satisfies EnvironmentOptions
        }

        return null
      },
      config() {
        return {
          builder: {
            sharedPlugins: true,
            async buildApp(builder) {
              const clientEnv = builder.environments['client']
              const serverEnv = builder.environments['server']

              if (!clientEnv) {
                throw new Error('Client environment not found')
              }

              if (!serverEnv) {
                throw new Error('SSR environment not found')
              }

              await builder.build(clientEnv)
              await builder.build(serverEnv)

              const nitroConfig: NitroConfig = {
                dev: false,
                // TODO do we need this? should this be made configurable?
                compatibilityDate: '2024-11-19',
                logLevel: 0,
                preset: buildPreset,
                publicAssets: [
                  {
                    dir: path.resolve(options.root, clientDistDir),
                  },
                ],
                typescript: {
                  generateTsConfig: false,
                },
                prerender: undefined,
                renderer: ssrEntryFile,
                rollupConfig: {
                  plugins: [
                    virtualBundlePlugin(getSsrBundle()),
                  ]
                }
              }

              const nitro = await createNitro(nitroConfig)

              await buildNitroEnvironment(nitro, () => build(nitro))

              if (options.prerender?.enabled) {
                await prerender({
                  options,
                  nitro,
                  builder,
                })
              }

              // if (nitroConfig.prerender?.routes?.length && options.sitemap) {
              //   console.log('Building Sitemap...')
              //   // sitemap needs to be built after all directories are built
              //   await buildSitemap({
              //     host: options.sitemap.host,
              //     routes: nitroConfig.prerender.routes,
              //     outputDir: resolve(options.root, 'dist/public'),
              //   })
              // }

              // console.log(
              //   `\n\n✅ Client and server bundles successfully built.`,
              // )
            },
          },
        }
      },
      // async buildStart() {
      //   await Promise.all(
      //     [
      //       nitro.options.output.dir,
      //       nitro.options.output.serverDir,
      //       nitro.options.output.publicDir,
      //     ].map((dir) => {
      //       if (dir) {
      //         return promises.mkdir(dir, {
      //           recursive: true,
      //         })
      //       }
      //       return
      //     }),
      //   )
      // },
    },
  ]
}

function virtualBundlePlugin(
  ssrBundle: Rollup.OutputBundle,
): PluginOption {
  type VirtualModule = { code: string, map: string | null }
  const _modules = new Map<string, VirtualModule>();

  // group chunks and source maps
  for (const [fileName, content] of Object.entries(ssrBundle)) {
    if (content.type === 'chunk') {
      const virtualModule: VirtualModule = {
        code: content.code,
        map: null,
      }
      const maybeMap = ssrBundle[`${fileName}.map`]
      if (maybeMap && maybeMap.type === 'asset') {
        virtualModule.map = maybeMap.source as string
      }
      _modules.set(fileName, virtualModule);
      _modules.set(resolve(fileName), virtualModule);
    }
  }
 
  return {
    name: 'virtual-bundle',
    resolveId(id, importer) {
      if (_modules.has(id)) {
        return resolve(id);
      }

      if (importer) {
        const resolved = resolve(dirname(importer), id);
        if (_modules.has(resolved)) {
          return resolved;
        }
      }
      return null
    },
    load(id) {
      const m = _modules.get(id)
      if (!m) {
        return null;
      }
      return m
    }
  }
}