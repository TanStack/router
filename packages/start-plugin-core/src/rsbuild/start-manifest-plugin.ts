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
  modules?: Array<StatsModule>
  names?: Array<string>
  entry?: boolean
  initial?: boolean
}

type StatsModule = {
  name?: string
  identifier?: string
  nameForCondition?: string
}

type StatsJson = {
  entrypoints?: Record<string, { assets?: Array<StatsAsset> }>
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

function createEntryScriptTags(
  basePath: string,
  assets: Array<string>,
): Array<RouterManagedTag> {
  return assets.map((asset) => ({
    tag: 'script',
    attrs: {
      type: 'module',
      async: true,
      src: joinURL(basePath, asset),
    },
  }))
}

function unique(items: Array<string>) {
  return Array.from(new Set(items))
}

function getRouteModuleFilePath(module: StatsModule): string | undefined {
  const moduleId = module.identifier ?? module.name ?? ''
  if (!moduleId.includes(tsrSplit)) return undefined

  if (module.nameForCondition) {
    return module.nameForCondition
  }

  const resource = moduleId.split('!').pop() ?? moduleId
  const cleanedResource = resource.startsWith('module|')
    ? resource.slice('module|'.length)
    : resource
  const [resourcePath, queryString] = cleanedResource.split('?')
  if (!queryString?.includes(tsrSplit)) return undefined

  return resourcePath
}

function getStatsEntryPointName(statsJson: StatsJson): string | undefined {
  const entrypoints = statsJson.entrypoints ?? {}
  if (entrypoints['index']) return 'index'
  if (entrypoints['main']) return 'main'
  return Object.keys(entrypoints)[0]
}

function getStatsEntryAssets(statsJson: StatsJson): {
  entrypointName?: string
  assets: Array<string>
} {
  const entrypoints = statsJson.entrypoints ?? {}
  const entrypointName = getStatsEntryPointName(statsJson)
  const entrypoint = entrypointName ? entrypoints[entrypointName] : undefined

  if (!entrypoint?.assets) {
    return { entrypointName, assets: [] }
  }

  return {
    entrypointName,
    assets: unique(
      entrypoint.assets
        .map(getAssetName)
        .filter((asset): asset is string => Boolean(asset)),
    ),
  }
}

function getEntryChunkAssets(
  statsJson: StatsJson,
  entrypointName?: string,
): Array<string> {
  if (!entrypointName) return []
  const chunks = statsJson.chunks ?? []
  const entryChunks = chunks.filter((chunk) => {
    if (chunk.entry) return true
    const names = chunk.names ?? []
    return names.includes(entrypointName)
  })
  return unique(
    entryChunks.flatMap((chunk) => chunk.files ?? []).filter(isJsAsset),
  )
}

function pickEntryAsset(
  assets: Array<string>,
  entrypointName?: string,
): string | undefined {
  if (assets.length === 0) return undefined
  if (entrypointName) {
    const match = assets.find((asset) => {
      const baseName = path.posix.basename(asset)
      return (
        baseName === `${entrypointName}.js` ||
        baseName.startsWith(`${entrypointName}.`)
      )
    })
    if (match) return match
  }
  return assets[assets.length - 1]
}

function buildStartManifest({
  statsJson,
  basePath,
}: {
  statsJson: StatsJson
  basePath: string
}): Manifest & { clientEntry: string } {
  const { entrypointName, assets: entryAssets } =
    getStatsEntryAssets(statsJson)
  const entryJsAssets = unique(entryAssets.filter(isJsAsset))
  const entryCssAssets = unique(entryAssets.filter(isCssAsset))

  const entryFile =
    pickEntryAsset(entryJsAssets, entrypointName) ??
    pickEntryAsset(
      getEntryChunkAssets(statsJson, entrypointName),
      entrypointName,
    )
  if (!entryFile) {
    throw new Error('No client entry file found in rsbuild stats')
  }

  const routeTreeRoutes: Record<string, { filePath: string }> =
    globalThis.TSS_ROUTES_MANIFEST

  const routeChunks: Record<string, Array<StatsChunk>> = {}
  for (const chunk of statsJson.chunks ?? []) {
    const modules = chunk.modules ?? []
    for (const mod of modules) {
      const filePath = getRouteModuleFilePath(mod)
      if (!filePath) continue
      const normalizedPath = path.normalize(filePath)
      const existingChunks = routeChunks[normalizedPath]
      if (existingChunks) {
        existingChunks.push(chunk)
      } else {
        routeChunks[normalizedPath] = [chunk]
      }
    }
  }

  const manifest: Manifest = { routes: {} }

  Object.entries(routeTreeRoutes).forEach(([routeId, route]) => {
    const chunks = routeChunks[path.normalize(route.filePath)]
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

  const entryScriptAssets = entryJsAssets.filter(
    (asset) => asset !== entryFile,
  )

  manifest.routes[rootRouteId] = {
    ...(manifest.routes[rootRouteId] ?? {}),
    preloads: entryJsAssets.map((asset) => joinURL(basePath, asset)),
    assets: [
      ...createCssTags(basePath, entryCssAssets),
      ...createEntryScriptTags(basePath, entryScriptAssets),
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
            chunkModules: true,
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
  const pluginFactory = createRspackPlugin(() => ({
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
  return pluginFactory()
}
