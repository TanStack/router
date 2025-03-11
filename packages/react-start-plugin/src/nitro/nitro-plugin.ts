import { resolve } from 'node:path'
import { platform } from 'node:os'
import { normalizePath } from 'vite'
import { getRollupConfig } from 'nitropack/rollup'

import { createNitro } from 'nitropack'
import { buildSitemap } from './build-sitemap.js'
import { devServerPlugin } from './dev-server-plugin.js'
import type { NitroConfig } from 'nitropack'
import type { TanStackStartOutputConfig } from '../schema.js'

import type { EnvironmentOptions, PluginOption } from 'vite'

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
      configResolved(config) {
        // console.log(config.environments)
      },
      async config() {
        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (options.server.preset as string | undefined)

        const nitroConfig: NitroConfig = {
          ...options.server,
          preset: buildPreset,
          compatibilityDate: '2024-11-19',
          logLevel: options.server.logLevel || 0,
          srcDir: normalizePath(options.tsr.srcDirectory),
          // renderer: filePrefix + normalizePath(options.ssrEntryPath),
        }

        const nitro = await createNitro({
          dev: false,
          ...nitroConfig,
          typescript: {
            generateTsConfig: false,
          },
        })

        const nitroRollupOptions = getRollupConfig(nitro)

        const clientOptions: EnvironmentOptions = {
          build: {
            rollupOptions: {
              input: {
                main: options.clientEntryPath,
              },
            },
          },
        }

        const serverOptions: EnvironmentOptions = {
          build: {
            ssr: true,
            sourcemap: true,
            rollupOptions: {
              ...nitroRollupOptions,
              output: {
                ...nitroRollupOptions.output,
                sourcemap: undefined,
              },
              // plugins: nitroRollupOptions.plugins as Array<PluginOption>,
            },
          },
        }

        // console.log('serverOptions', serverOptions.build?.rollupOptions)

        return {
          environments: {
            client: clientOptions,
            server: serverOptions,
          },
          builder: {
            sharedPlugins: true,
            async buildApp(builder) {
              if (!builder.environments['client']) {
                throw new Error('Client environment not found')
              }

              if (!builder.environments['server']) {
                throw new Error('SSR environment not found')
              }

              console.log(
                builder.environments['server'].config.build.rollupOptions,
              )

              console.log('\n\nBuilding client...')
              await builder.build(builder.environments['client'])

              console.log('\n\nBuilding server...')
              await builder.build(builder.environments['server'])

              console.log('\n\nBuilding index.html...')

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
                `\n\n✅ Client and server bundles successfully built.`,
              )
            },
          },
        }
      },
    },
  ]
}
