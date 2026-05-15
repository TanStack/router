import { promises as fsp } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { basename, extname, join } from 'pathe'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { prerender } from '../prerender'
import {
  capturePrerenderEnv,
  restorePrerenderEnv,
  shouldSeparateRouteOptions,
} from '../prerender-route-options-env'
import { getBundlerOptions } from '../utils'
import { getServerOutputDirectory } from './output-directory'
import type { TanStackStartOutputConfig } from '../schema'
import type { PrerenderHandler, PrerenderPageSink } from '../prerender'
import type { Dirent } from 'node:fs'
import type { PreviewServer, ResolvedConfig, ViteBuilder } from 'vite'

export async function prerenderWithVite({
  startConfig,
  builder,
  pageSink,
}: {
  startConfig: TanStackStartOutputConfig
  builder: ViteBuilder
  pageSink?: PrerenderPageSink
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
  const prerenderEnvState = capturePrerenderEnv()

  process.env.TSS_PRERENDERING = 'true'
  process.env.TSS_CLIENT_OUTPUT_DIR = outputDir

  let routeOptionsOutputDir: string | undefined
  let previewServer: PreviewServer | undefined
  let baseUrl: URL

  try {
    routeOptionsOutputDir = await importRouteOptionsEntry({
      startConfig,
      serverEnv,
      prerenderEnv: builder.environments[VITE_ENVIRONMENT_NAMES.prerender],
    })

    previewServer = await startPreviewServer(serverEnv.config)
    baseUrl = getResolvedUrl(previewServer)
  } catch (error) {
    delete globalThis.TSS_PRERENDER_ROUTE_TREE
    restorePrerenderEnv(prerenderEnvState)
    await previewServer?.close()
    if (routeOptionsOutputDir) {
      await fsp.rm(routeOptionsOutputDir, { recursive: true, force: true })
    }
    throw error
  }

  const handler: PrerenderHandler = {
    getClientOutputDirectory() {
      return outputDir
    },
    request(path, options) {
      const url = new URL(path, baseUrl)
      return fetch(new Request(url, options))
    },
    async close() {
      delete globalThis.TSS_PRERENDER_ROUTE_TREE
      restorePrerenderEnv(prerenderEnvState)
      await previewServer.close()
      if (routeOptionsOutputDir) {
        await fsp.rm(routeOptionsOutputDir, { recursive: true, force: true })
      }
    },
  }

  return prerender({
    startConfig,
    handler,
    pageSink,
  })
}

async function importRouteOptionsEntry({
  startConfig,
  serverEnv,
  prerenderEnv,
}: {
  startConfig: TanStackStartOutputConfig
  serverEnv: NonNullable<ViteBuilder['environments'][string]>
  prerenderEnv: ViteBuilder['environments'][string] | undefined
}): Promise<string | undefined> {
  const separateRouteOptions = shouldSeparateRouteOptions(startConfig)
  const routeOptionsEnv = separateRouteOptions ? prerenderEnv : serverEnv

  if (!routeOptionsEnv) {
    throw new Error(
      `Vite's "${VITE_ENVIRONMENT_NAMES.prerender}" environment not found`,
    )
  }

  const outputName = getRouteOptionsEntryName(
    getBundlerOptions(routeOptionsEnv.config.build)?.input ?? 'server',
  )

  if (!outputName) {
    return undefined
  }

  delete globalThis.TSS_PRERENDER_ROUTE_TREE

  // Import the prerender-only entry before crawling so route options from the
  // initialized router are available for dynamic route discovery.
  const outputDir = separateRouteOptions
    ? routeOptionsEnv.config.build.outDir
    : getServerOutputDirectory(serverEnv.config)
  const entryPath = await resolveRouteOptionsEntryPath(outputDir, outputName)

  try {
    await importWithCacheBust(entryPath)
  } catch (error) {
    if (separateRouteOptions) {
      await fsp.rm(outputDir, { recursive: true, force: true })
    }
    throw error
  }

  return separateRouteOptions ? outputDir : undefined
}

async function resolveRouteOptionsEntryPath(
  outputDir: string,
  outputName: string,
) {
  for (const ext of ['.js', '.mjs']) {
    const entryPath = join(outputDir, `${outputName}${ext}`)
    try {
      await fsp.access(entryPath)
      return entryPath
    } catch {
      // Try the next common Vite SSR extension before scanning below.
    }
  }

  const entryPath = await findEntryFile(outputDir, outputName)
  if (entryPath) {
    return entryPath
  }

  throw new Error(
    `Unable to resolve Vite route-options entry ${outputName} in ${outputDir}`,
  )
}

async function findEntryFile(
  directory: string,
  outputName: string,
): Promise<string | undefined> {
  let entries: Array<Dirent>

  try {
    entries = await fsp.readdir(directory, { withFileTypes: true })
  } catch {
    return undefined
  }

  const matches: Array<string> = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      const match = await findEntryFile(entryPath, outputName)
      if (match) {
        matches.push(match)
      }
      continue
    }

    const ext = extname(entry.name)
    if (ext !== '.js' && ext !== '.mjs') {
      continue
    }

    const name = basename(entry.name, ext)
    if (name === outputName || name.startsWith(`${outputName}-`)) {
      matches.push(entryPath)
    }
  }

  if (matches.length === 1) {
    return matches[0]
  }

  if (matches.length > 1) {
    throw new Error(
      `Unable to resolve a unique Vite route-options entry ${outputName} in ${directory}`,
    )
  }

  return undefined
}

async function importWithCacheBust(path: string) {
  const url = pathToFileURL(path)
  url.searchParams.set('tss-prerender', Date.now().toString())
  await import(url.toString())
}

function getRouteOptionsEntryName(input: unknown): string | undefined {
  if (typeof input === 'string') {
    return basename(input, extname(input))
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    )

    if (entries.length === 1) {
      return entries[0]![0]
    }

    const serverEntry = entries.find(([name]) => name === 'server')

    if (serverEntry) {
      return serverEntry[0]
    }

    throw new Error('Unable to resolve Vite route-options entry point')
  }

  return undefined
}

async function startPreviewServer(
  viteConfig: ResolvedConfig,
): Promise<PreviewServer> {
  const vite = await import('vite')

  try {
    return await vite.preview({
      configFile: viteConfig.configFile,
      preview: {
        port: 0,
        open: false,
      },
    })
  } catch (error) {
    throw new Error(
      'Failed to start the Vite preview server for prerendering',
      {
        cause: error,
      },
    )
  }
}

function getResolvedUrl(previewServer: PreviewServer): URL {
  const baseUrl = previewServer.resolvedUrls?.local[0]

  if (!baseUrl) {
    throw new Error('No resolved URL is available from the Vite preview server')
  }

  return new URL(baseUrl)
}
