import { HEADERS } from '@tanstack/start-server-core'
import { buildSitemap } from './build-sitemap'
import { VITE_ENVIRONMENT_NAMES } from './constants'
import { prerender } from './prerender'
import type { TanStackStartOutputConfig } from './schema'
import type { ViteBuilder } from 'vite'

export async function postServerBuild({
  builder,
  startConfig,
}: {
  builder: ViteBuilder
  startConfig: TanStackStartOutputConfig
}) {
  // If the user has not set a prerender option, we need to set it to true
  // if the pages array is not empty and has sub options requiring for prerendering
  // If the user has explicitly set prerender.enabled, this should be respected
  if (startConfig.prerender?.enabled !== false) {
    startConfig.prerender = {
      ...startConfig.prerender,
      enabled:
        startConfig.prerender?.enabled ??
        startConfig.pages.some((d) =>
          typeof d === 'string' ? false : !!d.prerender?.enabled,
        ),
    }
  }

  // Setup the options for prerendering the SPA shell (i.e `src/routes/__root.tsx`)
  if (startConfig.spa?.enabled) {
    startConfig.prerender = {
      ...startConfig.prerender,
      enabled: true,
    }

    const maskUrl = new URL(startConfig.spa.maskPath, 'http://localhost')

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

  // Run the prerendering process
  if (startConfig.prerender.enabled) {
    await prerender({
      startConfig,
      builder,
    })
  }

  // Run the sitemap build process
  if (startConfig.pages.length) {
    buildSitemap({
      startConfig,
      publicDir:
        builder.environments[VITE_ENVIRONMENT_NAMES.client]?.config.build
          .outDir ?? builder.config.build.outDir,
    })
  }
}
