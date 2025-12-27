import { buildSitemap } from './build-sitemap'
import { VITE_ENVIRONMENT_NAMES } from './constants'
import { setupPrerenderConfig } from './prerender-config'
import { prerender } from './prerender'
import { prerenderWithNitro, resolveNitroOutputPaths } from './prerender-nitro'
import type { TanStackStartOutputConfig } from './schema'
import type { ViteBuilder } from 'vite'

export async function postServerBuild({
  builder,
  startConfig,
  skipPrerender = false,
}: {
  builder: ViteBuilder
  startConfig: TanStackStartOutputConfig
  skipPrerender?: boolean
}) {
  setupPrerenderConfig(startConfig)

  if (startConfig.prerender?.enabled && !skipPrerender) {
    await prerender({
      startConfig,
      builder,
    })
  }

  // Run the sitemap build process
  if (startConfig.sitemap?.enabled) {
    buildSitemap({
      startConfig,
      publicDir:
        builder.environments[VITE_ENVIRONMENT_NAMES.client]?.config.build
          .outDir ?? builder.config.build.outDir,
    })
  }
}

export async function postServerBuildForNitro({
  startConfig,
  nitro,
  mode,
  configFile,
}: {
  startConfig: TanStackStartOutputConfig
  nitro: {
    options: {
      rootDir: string
      output?: {
        dir?: string
        publicDir?: string
      }
      preset?: string
    }
  }
  mode: 'vite-preview' | 'nitro-server'
  configFile?: string
}) {
  setupPrerenderConfig(startConfig)

  if (startConfig.prerender?.enabled) {
    await prerenderWithNitro({
      startConfig,
      nitro,
      mode,
      configFile,
    })
  }

  if (startConfig.pages.length) {
    const { publicDir } = resolveNitroOutputPaths(nitro)
    buildSitemap({
      startConfig,
      publicDir,
    })
  }
}
