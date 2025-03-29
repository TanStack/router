import { platform } from 'node:os'
import path from 'node:path'
import { createNitro } from 'nitropack'
import { normalizePath } from 'vite'

import { getRollupConfig } from 'nitropack/rollup'
import { buildNitroEnvironment } from '@tanstack/start-plugin-core'
import { clientDistDir } from '../index.js'
import { prerender } from '../prerender.js'
import { devServerPlugin } from './dev-server-plugin.js'
import type { EnvironmentOptions, PluginOption } from 'vite'
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
): Array<PluginOption> {
  let nitro: Nitro
  let nitroRollupOptions: ReturnType<typeof getRollupConfig>

  const buildPreset =
    process.env['START_TARGET'] ?? (options.target as string | undefined)

  const nitroConfig: NitroConfig = {
    dev: false,
    compatibilityDate: '2024-11-19',
    srcDir: normalizePath(options.tsr.srcDirectory),
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
    renderer: options.serverEntryPath,
  }

  return [
    devServerPlugin(options),
    {
      name: 'tanstack-vite-plugin-nitro',
      async configEnvironment(name) {
        nitro = await createNitro(nitroConfig)

        nitroRollupOptions = getRollupConfig(nitro)

        if (name === 'server') {
          return {
            build: {
              commonjsOptions: {
                include: [],
              },
              ssr: true,
              sourcemap: true,
              rollupOptions: {
                ...nitroRollupOptions,
                output: {
                  ...nitroRollupOptions.output,
                  sourcemap: undefined,
                },
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
              await buildNitroEnvironment(nitro, () => builder.build(serverEnv))

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
