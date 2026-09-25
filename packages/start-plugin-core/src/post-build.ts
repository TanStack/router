import { HEADERS } from '@tanstack/start-server-core/constants'
import { createSitemapWriter } from './build-sitemap'
import type { TanStackStartOutputConfig } from './schema'
import type { PrerenderPageSink } from './prerender'

export interface StartPostBuildAdapter {
  getClientOutputDirectory: () => string
  prerender: (
    startConfig: TanStackStartOutputConfig,
    options?: { pageSink?: PrerenderPageSink },
  ) => Promise<void>
}

export async function postBuild({
  startConfig,
  adapter,
}: {
  startConfig: TanStackStartOutputConfig
  adapter: StartPostBuildAdapter
}) {
  if (startConfig.prerender?.enabled !== false) {
    startConfig.prerender = {
      ...startConfig.prerender,
      enabled:
        startConfig.prerender?.enabled ??
        startConfig.pages.some((page) => page.prerender?.enabled),
    }
  }

  const spaOnly = Boolean(
    startConfig.spa?.enabled && startConfig.prerender.enabled !== true,
  )

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

  const sitemap = startConfig.sitemap?.enabled
    ? createSitemapWriter({
        startConfig,
        publicDir: adapter.getClientOutputDirectory(),
      })
    : undefined
  try {
    if (startConfig.prerender.enabled) {
      await adapter.prerender({ ...startConfig }, { pageSink: sitemap?.write })
    } else if (sitemap) {
      for (const page of startConfig.pages) {
        await sitemap.write(page)
      }
    }
  } finally {
    await sitemap?.close()
  }
}
