import { resolve } from 'node:path'
import { platform } from 'node:os'
import { normalizePath } from 'vite'
import { getRollupConfig } from 'nitropack/rollup'

import { createNitro } from 'nitropack'
import { buildSitemap } from './build-sitemap.js'
import { devServerPlugin } from './plugins/dev-server-plugin.js'
import type { NitroConfig } from 'nitropack'
import type { TanStackStartOutputConfig } from '../schema.js'

import type { PluginOption } from 'vite'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from '../schema.js'

const isWindows = platform() === 'win32'
const filePrefix = isWindows ? 'file:///' : ''

export function nitroPlugin(
  options: TanStackStartOutputConfig,
): Array<PluginOption> {
  return [
    devServerPlugin(options),
    {
      name: 'tanstack-vite-plugin-nitro',
      async config() {
        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (options.server.preset as string | undefined)

        const nitroConfig: NitroConfig = {
          ...options.server,
          preset: buildPreset,
          compatibilityDate: '2024-11-19',
          logLevel: options.server.logLevel || 0,
          srcDir: normalizePath(options.tsr.appDirectory),
          renderer: filePrefix + normalizePath(options.ssrEntryPath),
        }

        const nitro = await createNitro({
          dev: false,
          ...nitroConfig,
          typescript: {
            generateTsConfig: false,
          },
        })

        const nitroRollupOptions = getRollupConfig(nitro)

        return {
          environments: {
            server: {
              build: {
                ssr: true,
                rollupOptions: {
                  ...nitroRollupOptions,
                  plugins: nitroRollupOptions.plugins as Array<PluginOption>,
                },
              },
            },
          },
          builder: {
            sharedPlugins: true,
            buildApp: async (builder) => {
              if (!builder.environments['client']) {
                throw new Error('Client environment not found')
              }

              if (!builder.environments['server']) {
                throw new Error('SSR environment not found')
              }

              await builder.build(builder.environments['client'])
              await builder.build(builder.environments['server'])

              if (nitroConfig.prerender?.routes?.length && options.sitemap) {
                console.log('Building Sitemap...')
                // sitemap needs to be built after all directories are built
                await buildSitemap({
                  host: options.sitemap.host,
                  routes: nitroConfig.prerender.routes,
                  outputDir: resolve(options.root, 'dist/public'),
                })
              }

              console.log(
                `\n\nThe 'tanstack-platform' server has been successfully built.`,
              )
            },
          },
        }
      },
    },
  ]
}
