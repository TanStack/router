import { HEADERS } from '@tanstack/start-server-core'
import { buildSitemap } from './build-sitemap'
import type { TanStackStartOutputConfig } from './schema'

export interface StartPostBuildAdapter {
  getClientOutputDirectory: () => string
  prerender: (startConfig: TanStackStartOutputConfig) => Promise<void>
}

export async function postBuild({
  startConfig,
  adapter,
}: {
  startConfig: TanStackStartOutputConfig
  adapter: StartPostBuildAdapter
}) {
  const spaOnly =
    startConfig.spa?.enabled && startConfig.prerender?.enabled !== true

  if (startConfig.prerender?.enabled !== false) {
    startConfig.prerender = {
      ...startConfig.prerender,
      enabled:
        startConfig.prerender?.enabled ??
        startConfig.pages.some((page) => page.prerender?.enabled),
    }
  }

  if (startConfig.spa?.enabled) {
    if (spaOnly) {
      startConfig.pages = []
    }

    startConfig.prerender = {
      ...startConfig.prerender,
      ...(spaOnly
        ? {
            autoStaticPathsDiscovery: false,
          }
        : {}),
      enabled: true,
    }

    const maskUrl = new URL(startConfig.spa.maskPath, 'http://localhost')
    if (maskUrl.origin !== 'http://localhost') {
      throw new Error('spa.maskPath must be a path (no protocol/host)')
    }

    startConfig.pages.push({
      path: maskUrl.toString().replace('http://localhost', ''),
      prerender: {
        ...startConfig.spa.prerender,
        headers: {
          ...startConfig.spa.prerender.headers,
          [HEADERS.TSS_SHELL]: 'true',
        },
      },
      sitemap: {
        exclude: true,
      },
    })
  }

  if (startConfig.prerender.enabled) {
    await adapter.prerender(startConfig)
  }

  if (startConfig.sitemap?.enabled) {
    buildSitemap({
      startConfig,
      publicDir: adapter.getClientOutputDirectory(),
    })
  }
}
