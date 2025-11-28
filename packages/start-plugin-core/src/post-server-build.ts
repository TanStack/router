import { promises as fsp } from 'node:fs'
import path from 'pathe'
import { HEADERS } from '@tanstack/start-server-core'
import { buildSitemap } from './build-sitemap'
import { VITE_ENVIRONMENT_NAMES } from './constants'
import { prerender } from './prerender'
import { createLogger } from './utils'
import type { TanStackStartOutputConfig } from './schema'
import type { ViteBuilder } from 'vite'

/**
 * Write a minimal nitro.json file for vite.preview() to work with Nitro's
 * configurePreviewServer hook. This is needed because the 'compiled' hook
 * runs before Nitro writes its build info.
 */
export async function writeNitroBuildInfo({
  outputDir,
  preset,
}: {
  outputDir: string
  preset: string
}) {
  const logger = createLogger('prerender')
  logger.info('Writing nitro.json for vite.preview()...')

  const buildInfo = {
    date: new Date().toJSON(),
    preset,
    framework: { name: 'tanstack-start' },
    versions: {},
    commands: {
      preview: `node ${path.join(outputDir, 'server/index.mjs')}`,
    },
  }

  const buildInfoPath = path.join(outputDir, 'nitro.json')
  await fsp.writeFile(buildInfoPath, JSON.stringify(buildInfo, null, 2))
}

function setupPrerenderConfig(startConfig: TanStackStartOutputConfig) {
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
}

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
  outputDir,
  configFile,
}: {
  startConfig: TanStackStartOutputConfig
  outputDir: string
  configFile?: string
}) {
  setupPrerenderConfig(startConfig)

  if (startConfig.prerender?.enabled) {
    await prerender({
      startConfig,
      outputDir,
      configFile,
    })
  }

  if (startConfig.pages.length) {
    buildSitemap({
      startConfig,
      publicDir: outputDir,
    })
  }
}
