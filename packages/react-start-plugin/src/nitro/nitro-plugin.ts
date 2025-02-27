import { dirname, resolve } from 'node:path'
import { platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'

import { buildServer } from './build-server.js'
import { buildSSRApp } from './build-ssr.js'
import { buildSitemap } from './build-sitemap.js'
import { devServerPlugin } from './plugins/dev-server-plugin.js'
import type { TanStackStartOutputConfig } from '../schema.js'
import type { NitroConfig } from 'nitropack'

import type { PluginOption, UserConfig, ViteDevServer } from 'vite'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from '../schema.js'

const isWindows = platform() === 'win32'
const filePrefix = isWindows ? 'file:///' : ''
let clientOutputPath = ''

const __filename = fileURLToPath(
  // @ts-ignore Cannot figure out for the life of me why tsconfig.json won't let me fix this. Only shows up during build, not in editor.
  import.meta.url,
)
const __dirname = dirname(__filename)

export function nitroPlugin(
  options: TanStackStartOutputConfig & {
    plugins: Array<PluginOption>
  },
): Array<PluginOption> {
  let isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']

  let isBuild = false
  let isServe = false
  let ssrBuild = false
  let config: UserConfig
  let nitroConfig: NitroConfig
  let environmentBuild = false

  return [
    devServerPlugin(options),
    {
      name: 'tanstack-vite-plugin-nitro',
      config(userConfig, { mode, command }) {
        isServe = command === 'serve'
        isBuild = command === 'build'
        ssrBuild = userConfig.build?.ssr === true
        config = userConfig
        isTest = isTest ? isTest : mode === 'test'

        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (options.server.preset as string | undefined)

        const rendererEntry =
          filePrefix + normalizePath(options.routers.ssr.entry)

        nitroConfig = {
          ...options.server,
          preset: buildPreset,
          compatibilityDate: '2024-11-19',
          logLevel: options.server.logLevel || 0,
          srcDir: normalizePath(options.tsr.appDirectory),
          typescript: {
            generateTsConfig: false,
          },
          rollupConfig: {
            onwarn(warning) {
              if (
                warning.message.includes('empty chunk') &&
                warning.message.endsWith('.server')
              ) {
                return
              }
            },
            plugins: options.plugins,
          },
          handlers: [],
        }

        if (!ssrBuild && !isTest) {
          // store the client output path for the SSR build config
          clientOutputPath = resolve(
            options.root,
            config.build?.outDir || 'dist/client',
          )
        }

        nitroConfig.alias = {
          '#start/ssr': options.ssrEntryPath,
        }

        return {
          environments: {
            ssr: {
              build: {
                ssr: true,
                rollupOptions: {
                  input: options.ssrEntryPath,
                },
                outDir: resolve(options.root, 'dist/ssr'),
              },
            },
          },
          builder: {
            sharedPlugins: true,
            buildApp: async (builder) => {
              console.log('tanner buildApp', builder)
              environmentBuild = true

              if (!builder.environments['client']) {
                throw new Error('Client environment not found')
              }

              if (!builder.environments['ssr']) {
                throw new Error('SSR environment not found')
              }

              await Promise.all([
                builder.build(builder.environments['client']),
                builder.build(builder.environments['ssr']),
              ])

              await buildServer(nitroConfig)

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
      async configureServer(viteServer: ViteDevServer) {
        return // TODO: We'll remove this when we're ready for non-entry routes
        // if (isServe && !isTest) {
        //   const nitro = await createNitro({
        //     dev: true,
        //     ...nitroConfig,
        //   })

        //   const server = createDevServer(nitro)
        //   await build(nitro)

        //   // viteServer.middlewares.use(
        //   //   apiBase,
        //   //   toNodeListener(server.app as unknown as App),
        //   // )

        //   viteServer.httpServer?.once('listening', () => {
        //     process.env['START_HOST'] = !viteServer.config.server.host
        //       ? 'localhost'
        //       : (viteServer.config.server.host as string)
        //     process.env['START_PORT'] = `${viteServer.config.server.port}`
        //   })

        //   // handle upgrades if websockets are enabled
        //   if (nitroConfig.experimental?.websocket) {
        //     viteServer.httpServer?.on('upgrade', server.upgrade)
        //   }
        // }
      },
      async closeBundle() {
        // Skip when build is triggered by the Environment API
        if (environmentBuild) {
          return
        }

        if (ssrBuild) {
          return
        }

        if (isBuild) {
          console.log('Building SSR application...')
          await buildSSRApp({
            root: options.root,
            ssrEntry: options.ssrEntryPath,
            viteConfig: config,
          })

          if (options.sitemap) {
            console.log('Building Sitemap...')
            // sitemap needs to be built after all directories are built
            await buildSitemap({
              host: options.sitemap.host,
              routes: nitroConfig.prerender?.routes || [], // TODO: Can we get these routes from the final crawled routes from prerender?
              outputDir: resolve(options.root, 'dist/public'),
            })
          }

          await buildServer(nitroConfig)

          console.log(
            `\n\nThe 'tanstack-platform' server has been successfully built.`,
          )
        }
      },
    },
  ]
}
