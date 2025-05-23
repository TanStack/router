import path from 'node:path'
import { rmSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import { build, copyPublicAssets, createNitro, prepare } from 'nitropack'
import { dirname, resolve } from 'pathe'
import { clientDistDir, ssrEntryFile } from '../plugin'
import { prerender } from '../prerender'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { buildSitemap } from '../build-sitemap'
import { devServerPlugin } from './dev-server-plugin'
import type {
  EnvironmentOptions,
  PluginOption,
  Rollup,
  ViteBuilder,
} from 'vite'
import type { Nitro, NitroConfig } from 'nitropack'
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
        if (name === VITE_ENVIRONMENT_NAMES.server) {
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
              const clientEnv =
                builder.environments[VITE_ENVIRONMENT_NAMES.client]
              const serverEnv =
                builder.environments[VITE_ENVIRONMENT_NAMES.server]

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
              }

              const nitro = await createNitro(nitroConfig)

              await buildNitroApp(builder, nitro, options)
            },
          },
        }
      },
    },
  ]
}

/**
 * Correctly co-ordinates the nitro app build process to make sure that the
 * app is built, while also correctly handling the prerendering and sitemap
 * generation and including their outputs in the final build.
 */
async function buildNitroApp(
  builder: ViteBuilder,
  nitro: Nitro,
  startOptions: TanStackStartOutputConfig,
) {
  await prepare(nitro)
  await copyPublicAssets(nitro)

  const options = { ...startOptions }

  // If the user has not set a prerender option, we need to set it to true
  // if the pages array is not empty and has sub options requiring for prerendering
  if (options.prerender?.enabled !== false) {
    options.prerender = {
      ...options.prerender,
      enabled: options.pages.some((d) =>
        typeof d === 'string' ? false : !!d.prerender?.enabled,
      ),
    }
  }

  // Setup the options for prerendering the SPA shell (i.e `src/routes/__root.tsx`)
  if (options.spa?.enabled) {
    options.prerender = {
      ...options.prerender,
      enabled: true,
    }

    const maskUrl = new URL(options.spa.maskPath, 'http://localhost')

    maskUrl.searchParams.set('__TSS_SHELL', 'true')

    options.pages.push({
      path: maskUrl.toString().replace('http://localhost', ''),
      prerender: options.spa.prerender,
      sitemap: {
        exclude: true,
      },
    })
  }

  // Run the prerendering process
  if (options.prerender.enabled) {
    await prerender({
      options,
      nitro,
      builder,
    })
  }

  // Run the sitemap build process
  if (options.pages.length) {
    buildSitemap({
      options,
      publicDir: nitro.options.output.publicDir,
    })
  }

  // Build the nitro app
  await build(nitro)

  // Cleanup the vite public directory
  // As a part of the build process, the `.vite/` directory
  // is copied over from `.tanstack-start/build/client-dist/`
  // to the `publicDir` (e.g. `.output/public/`).
  // This directory (containing the vite manifest) should not be
  // included in the final build, so we remove it here.
  const publicDir = nitro.options.output.publicDir
  const viteDir = path.resolve(publicDir, '.vite')
  if (await fsp.stat(viteDir).catch(() => false)) {
    await fsp.rm(viteDir, { recursive: true, force: true })
  }

  // Close the nitro instance
  await nitro.close()
  nitro.logger.success(`Client and server bundles successfully built.`)
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
