import { HEADERS } from '@tanstack/start-server-core'
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

  const sitemap = startConfig.sitemap
  if (sitemap?.enabled && !sitemap.host) {
    throw new Error(
      'Sitemap host is not set and required to build the sitemap.',
    )
  }
  if (sitemap?.enabled && !sitemap.outputPath) {
    throw new Error('Sitemap output path is not set')
  }

  const sitemapWriter =
    sitemap?.enabled && sitemap.host && sitemap.outputPath
      ? createSitemapWriter({
          host: sitemap.host,
          outputPath: sitemap.outputPath,
          publicDir: adapter.getClientOutputDirectory(),
        })
      : null

  try {
    if (startConfig.prerender.enabled) {
      await adapter.prerender(startConfig, {
        pageSink: sitemapWriter ? (page) => sitemapWriter.write(page) : undefined,
      })
    } else if (sitemapWriter) {
      for (const page of startConfig.pages) {
        sitemapWriter.write(page)
      }
    }
  } finally {
    await sitemapWriter?.close()
  }
}
