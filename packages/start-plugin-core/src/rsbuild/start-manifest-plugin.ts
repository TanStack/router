import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { joinURL } from 'ufo'
import { rootRouteId } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { tsrSplit } from '@tanstack/router-plugin'
import { createRspackPlugin } from 'unplugin'
import type { Manifest, RouterManagedTag } from '@tanstack/router-core'

const START_MANIFEST_FILE = 'tanstack-start-manifest.json'

type StatsAsset = string | { name?: string }

type StatsChunk = {
  files?: Array<string>
  auxiliaryFiles?: Array<string>
  modules?: Array<{ name?: string; identifier?: string }>
}

type StatsJson = {
  entrypoints?: Record<
    string,
    {
      assets?: Array<StatsAsset>
    }
  >
  chunks?: Array<StatsChunk>
}

function getAssetName(asset: StatsAsset): string | undefined {
  if (!asset) return undefined
  if (typeof asset === 'string') return asset
  return asset.name
}

function isJsAsset(asset: string) {
  return asset.endsWith('.js') || asset.endsWith('.mjs')
}

function isCssAsset(asset: string) {
  return asset.endsWith('.css')
}

function createCssTags(
  basePath: string,
  assets: Array<string>,
): Array<RouterManagedTag> {
  return assets.map((asset) => ({
    tag: 'link',
    attrs: {
      rel: 'stylesheet',
      href: joinURL(basePath, asset),
      type: 'text/css',
    },
  }))
}

function unique(items: Array<string>) {
  return Array.from(new Set(items))
}

function getStatsEntryAssets(statsJson: StatsJson): Array<string> {
  const entrypoints = statsJson.entrypoints ?? {}
  const entrypoint =
    entrypoints['index'] ??
    entrypoints['main'] ??
    entrypoints[Object.keys(entrypoints)[0] ?? '']

  if (!entrypoint?.assets) return []

  return unique(
    entrypoint.assets
      .map(getAssetName)
      .filter((asset): asset is string => Boolean(asset)),
  )
}

function buildStartManifest({
  statsJson,
  basePath,
}: {
  statsJson: StatsJson
  basePath: string
}): Manifest & { clientEntry: string } {
  const entryAssets = getStatsEntryAssets(statsJson)
  const entryJsAssets = unique(entryAssets.filter(isJsAsset))
  const entryCssAssets = unique(entryAssets.filter(isCssAsset))

  const entryFile = entryJsAssets[0]
  if (!entryFile) {
    throw new Error('No client entry file found in rsbuild stats')
  }

  const routeTreeRoutes: Record<string, { filePath: string }> =
    globalThis.TSS_ROUTES_MANIFEST

  const routeChunks: Record<string, Array<StatsChunk>> = {}
  for (const chunk of statsJson.chunks ?? []) {
    const modules = chunk.modules ?? []
    for (const mod of modules) {
      const id = mod.identifier ?? mod.name ?? ''
      if (!id.includes(tsrSplit)) continue
      const [fileId, query] = id.split('?')
      if (!fileId || !query) continue
      const searchParams = new URLSearchParams(query)
      if (!searchParams.has(tsrSplit)) continue
      const existingChunks = routeChunks[fileId]
      if (existingChunks) {
        existingChunks.push(chunk)
      } else {
        routeChunks[fileId] = [chunk]
      }
    }
  }

  const manifest: Manifest = { routes: {} }

  Object.entries(routeTreeRoutes).forEach(([routeId, route]) => {
    const chunks = routeChunks[route.filePath]
    if (!chunks?.length) {
      manifest.routes[routeId] = {}
      return
    }

    const preloadAssets = unique(
      chunks.flatMap((chunk) => chunk.files ?? []).filter(isJsAsset),
    )
    const cssAssets = unique(
      chunks
        .flatMap((chunk) => [
          ...(chunk.files ?? []),
          ...(chunk.auxiliaryFiles ?? []),
        ])
        .filter(isCssAsset),
    )

    manifest.routes[routeId] = {
      preloads: preloadAssets.map((asset) => joinURL(basePath, asset)),
      assets: createCssTags(basePath, cssAssets),
    }
  })

  manifest.routes[rootRouteId] = {
    ...(manifest.routes[rootRouteId] ?? {}),
    preloads: entryJsAssets.map((asset) => joinURL(basePath, asset)),
    assets: [
      ...createCssTags(basePath, entryCssAssets),
      ...(manifest.routes[rootRouteId]?.assets ?? []),
    ],
  }

  return {
    routes: manifest.routes,
    clientEntry: joinURL(basePath, entryFile),
  }
}

export function createStartManifestRspackPlugin(opts: {
  basePath: string
  clientOutputDir: string
}) {
  return {
    apply(compiler: any) {
      compiler.hooks.done.tapPromise(
        'tanstack-start:manifest',
        async (stats: any) => {
          const statsJson: StatsJson = stats.toJson({
            all: false,
            entrypoints: true,
            chunks: true,
            modules: true,
          })

          const manifest = buildStartManifest({
            statsJson,
            basePath: opts.basePath,
          })

          const manifestPath = path.join(
            opts.clientOutputDir,
            START_MANIFEST_FILE,
          )
          await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
          await fsp.writeFile(
            manifestPath,
            JSON.stringify(manifest),
            'utf-8',
          )
        },
      )
    },
  }
}

export function createStartManifestVirtualModulePlugin(opts: {
  clientOutputDir: string
}) {
  const manifestPath = path.join(opts.clientOutputDir, START_MANIFEST_FILE)
  return createRspackPlugin(() => ({
    name: 'tanstack-start:manifest:virtual',
    resolveId(id) {
      if (id === VIRTUAL_MODULES.startManifest) {
        return id
      }
      return null
    },
    load(id) {
      if (id !== VIRTUAL_MODULES.startManifest) return null
      return `
import fs from 'node:fs'

let cached
export const tsrStartManifest = () => {
  if (cached) return cached
  try {
    const raw = fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf-8')
    cached = JSON.parse(raw)
    return cached
  } catch (error) {
    return { routes: {}, clientEntry: '' }
  }
}
`
    },
  }))
}
