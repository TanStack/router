import path from 'node:path'
import { rmSync } from 'node:fs'
import { build, createNitro } from 'nitropack'
import { dirname, resolve } from 'pathe'
import { clientDistDir, ssrEntryFile } from '../plugin'
import { prerender } from '../prerender'
import { devServerPlugin } from './dev-server-plugin'
import { buildNitroEnvironment } from './build-nitro'
import type { EnvironmentOptions, PluginOption, Rollup } from 'vite'
import type { NitroConfig } from 'nitropack'
import type { TanStackStartOutputConfig } from '../plugin'

export function nitroPlugin(
  options: TanStackStartOutputConfig,
  getSsrBundle: () => Rollup.OutputBundle,
): Array<PluginOption> {
  const buildPreset =
    process.env['START_TARGET'] ?? (options.target as string | undefined)

  return [
    devServerPlugin(),
    {
      name: 'tanstack-vite-plugin-nitro',
      configEnvironment(name) {
        if (name === 'server') {
          return {
            build: {
              commonjsOptions: {
                include: [],
              },
              ssr: true,
              sourcemap: true,
              rollupOptions: {
                input: '/~start/server-entry',
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

              const clientOutputDir = resolve(options.root, clientDistDir)
              rmSync(clientOutputDir, { recursive: true, force: true })
              await builder.build(clientEnv)

              await builder.build(serverEnv)

              const nitroConfig: NitroConfig = {
                dev: false,
                // TODO do we need this? should this be made configurable?
                compatibilityDate: '2024-11-19',
                logLevel: 3,
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
                  plugins: [virtualBundlePlugin(getSsrBundle())],
                },
                routeRules: {
                  // TODO: We need to expose *some* kind of routeRules configuration
                  // and it needs to translate to this for now. But we should
                  // be cognizant of the probability that we will not use Nitro's
                  // routeRules configuration in the future.
                  ...(options.shell.enabled && options.shell.autoRedirect
                    ? {
                        '/**': {
                          // @ts-expect-error We are using this as a marker
                          __TSS_SHELL: true,
                          redirect: {
                            to: `${options.shell.prerender.outputPath.replace(/[/]{1,}$/, '')}`,
                            statusCode: 200,
                          },
                        },
                      }
                    : {}),
                },
              }

              const nitro = await createNitro(nitroConfig)

              await buildNitroEnvironment(nitro, () => build(nitro))

              if (options.shell.enabled) {
                options.prerender = {
                  ...options.prerender,
                  enabled: true,
                }

                const maskUrl = new URL(
                  options.shell.maskPath,
                  'http://localhost',
                )

                maskUrl.searchParams.set('__TSS_SHELL', 'true')

                options.pages.push({
                  path: maskUrl.toString().replace('http://localhost', ''),
                  prerender: options.shell.prerender,
                  sitemap: {
                    exclude: true,
                  },
                })
              }

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
    },
  ]
}

function virtualBundlePlugin(ssrBundle: Rollup.OutputBundle): Rollup.Plugin {
  type VirtualModule = { code: string; map: string | null }
  const _modules = new Map<string, VirtualModule>()

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
      _modules.set(fileName, virtualModule)
      _modules.set(resolve(fileName), virtualModule)
    }
  }

  return {
    name: 'virtual-bundle',
    resolveId(id, importer) {
      if (_modules.has(id)) {
        return resolve(id)
      }

      if (importer) {
        const resolved = resolve(dirname(importer), id)
        if (_modules.has(resolved)) {
          return resolved
        }
      }
      return null
    },
    load(id) {
      const m = _modules.get(id)
      if (!m) {
        return null
      }
      return m
    },
  }
}
