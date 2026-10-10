import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { prerender } from '../prerender'
import { startPrerenderPreview } from './prerender-preview'
import type { PrerenderHandler } from '../prerender'
import type { TanStackStartOutputConfig } from '../schema'
import type { ViteBuilder } from 'vite'

export async function prerenderWithVite({
  startConfig,
  builder,
}: {
  startConfig: TanStackStartOutputConfig
  builder: ViteBuilder
}) {
  const serverEnv = builder.environments[VITE_ENVIRONMENT_NAMES.server]

  if (!serverEnv) {
    throw new Error(
      `Vite's "${VITE_ENVIRONMENT_NAMES.server}" environment not found`,
    )
  }

  const clientEnv = builder.environments[VITE_ENVIRONMENT_NAMES.client]
  if (!clientEnv) {
    throw new Error(
      `Vite's "${VITE_ENVIRONMENT_NAMES.client}" environment not found`,
    )
  }

  const outputDir = clientEnv.config.build.outDir

  const previewServer = await startPrerenderPreview({
    configFile: serverEnv.config.configFile,
    outputDir,
  })
  const { baseUrl } = previewServer

  const handler: PrerenderHandler = {
    getClientOutputDirectory() {
      return outputDir
    },
    getOrigin() {
      return baseUrl.origin
    },
    request(path, options) {
      const url = new URL(path, baseUrl)
      if (url.origin !== baseUrl.origin) {
        throw new Error(`Prerender request URL must be relative: ${path}`)
      }
      return fetch(new Request(url, options))
    },
  }

  try {
    return await prerender({
      startConfig,
      handler,
    })
  } finally {
    await previewServer.close()
  }
}
