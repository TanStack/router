import { platform } from 'node:os'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { copyPublicAssets, createNitro, prepare } from 'nitropack'
import { version } from 'nitropack/meta'
import { normalizePath } from 'vite'

import { getRollupConfig } from 'nitropack/rollup'
import { clientDistDir } from '../index.js'
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
    process.env['BUILD_PRESET'] ?? (options.server.preset as string | undefined)

  const nitroConfig: NitroConfig = {
    compatibilityDate: '2024-11-19',
    logLevel: options.server.logLevel || 0,
    srcDir: normalizePath(options.tsr.srcDirectory),
    ...options.server,
    preset: buildPreset,
    publicAssets: [
      {
        dir: clientDistDir,
      },
    ],
    typescript: {
      generateTsConfig: false,
    },
    prerender: {
      ...options.server.prerender,
      routes: ['/', ...(options.server.prerender?.routes || [])],
    },
    renderer: options.serverEntryPath,
  }

  return [
    devServerPlugin(options),
    {
      name: 'tanstack-vite-plugin-nitro',
      async configEnvironment(name) {
        nitro = await createNitro({
          dev: false,
          ...nitroConfig,
        })

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
              if (!builder.environments['client']) {
                throw new Error('Client environment not found')
              }

              if (!builder.environments['server']) {
                throw new Error('SSR environment not found')
              }

              await builder.build(builder.environments['client'])
              await prepare(nitro)
              await copyPublicAssets(nitro)

              // if (
              //   nitroConfig.prerender?.routes &&
              //   nitroConfig.prerender.routes.length > 0
              // ) {
              //   console.log(`Prerendering static pages...`)
              //   await prerender(nitro)
              // }

              await builder.build(builder.environments['server'])

              const buildInfoPath = path.resolve(
                nitro.options.output.dir,
                'nitro.json',
              )

              const presetsWithConfig = [
                'awsAmplify',
                'awsLambda',
                'azure',
                'cloudflare',
                'firebase',
                'netlify',
                'vercel',
              ]

              const buildInfo = {
                date: /* @__PURE__ */ new Date().toJSON(),
                preset: nitro.options.preset,
                framework: nitro.options.framework,
                versions: {
                  nitro: version,
                },
                commands: {
                  preview: nitro.options.commands.preview,
                  deploy: nitro.options.commands.deploy,
                },
                config: {
                  ...Object.fromEntries(
                    presetsWithConfig.map((key) => [
                      key,
                      (nitro.options as any)[key],
                    ]),
                  ),
                },
              }

              await fsp.writeFile(
                buildInfoPath,
                JSON.stringify(buildInfo, null, 2),
              )

              await nitro.close()

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
