/* eslint-disable @typescript-eslint/prefer-for-of */
import { serialize } from 'seroval'
import { joinURL } from 'ufo'
import { resolveManifestAssetLink, rootRouteId } from '@tanstack/router-core'
import {
  getRouteFilePathsFromModuleIds,
  normalizeViteClientBuild,
  normalizeViteClientChunk,
} from '../vite/start-manifest-plugin/normalized-client-build'
import type { ManifestAssetLink, RouterManagedTag } from '@tanstack/router-core'
import type { NormalizedClientBuild, NormalizedClientChunk } from '../types'

const VISITING_CHUNK = 1

type RouteTreeRoute = {
  filePath?: string
  preloads?: Array<string>
  assets?: Array<RouterManagedTag>
  children?: Array<string>
}

type RouteTreeRoutes = Record<string, RouteTreeRoute>

interface ScannedClientChunks {
  entryChunk: NormalizedClientChunk
  chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>
  routeChunksByFilePath: ReadonlyMap<string, Array<NormalizedClientChunk>>
}

interface ManifestAssetResolvers {
  getAssetPath: (fileName: string) => string
  getChunkPreloads: (chunk: NormalizedClientChunk) => Array<string>
  getStylesheetAsset: (cssFile: string) => RouterManagedTag
}

type DedupeRoute = {
  preloads?: Array<ManifestAssetLink>
  assets?: Array<RouterManagedTag>
  children?: Array<string>
}

export interface StartManifest {
  routes: Record<string, RouteTreeRoute>
  clientEntry: string
}

export function appendUniqueStrings(
  target: Array<string> | undefined,
  source: Array<string>,
) {
  // Similar to Set.prototype.union, but for ordered arrays.
  // It preserves first-seen order and returns the original target array when
  // source contributes no new values, which avoids extra allocations.
  if (source.length === 0) {
    return target
  }

  if (!target || target.length === 0) {
    return source
  }

  const seen = new Set(target)
  let result: Array<string> | undefined

  for (const value of source) {
    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    if (!result) {
      result = target.slice()
    }
    result.push(value)
  }

  return result ?? target
}

export function appendUniqueAssets(
  target: Array<RouterManagedTag> | undefined,
  source: Array<RouterManagedTag>,
) {
  // Same semantics as appendUniqueStrings, but uniqueness is based on the
  // serialized asset identity instead of object reference.
  if (source.length === 0) {
    return target
  }

  if (!target || target.length === 0) {
    return source
  }

  const seen = new Set(target.map(getAssetIdentity))
  let result: Array<RouterManagedTag> | undefined

  for (const asset of source) {
    const identity = getAssetIdentity(asset)
    if (seen.has(identity)) {
      continue
    }

    seen.add(identity)
    if (!result) {
      result = target.slice()
    }
    result.push(asset)
  }

  return result ?? target
}

function getAssetIdentity(asset: RouterManagedTag) {
  return JSON.stringify({
    tag: asset.tag,
    attrs: normalizeAssetAttrs(asset.attrs),
    children: 'children' in asset ? (asset.children ?? null) : null,
  })
}

function normalizeAssetAttrs(attrs: Record<string, any> | undefined) {
  if (!attrs) {
    return null
  }

  const entries = Object.entries(attrs)
  if (entries.length === 0) {
    return null
  }

  entries.sort(([left], [right]) => left.localeCompare(right))
  return Object.fromEntries(entries)
}

function mergeRouteChunkData(options: {
  route: RouteTreeRoute
  chunk: NormalizedClientChunk
  getChunkCssAssets: (chunk: NormalizedClientChunk) => Array<RouterManagedTag>
  getChunkPreloads: (chunk: NormalizedClientChunk) => Array<string>
}) {
  const chunkAssets = options.getChunkCssAssets(options.chunk)
  const chunkPreloads = options.getChunkPreloads(options.chunk)

  options.route.assets = appendUniqueAssets(options.route.assets, chunkAssets)
  options.route.preloads = appendUniqueStrings(
    options.route.preloads,
    chunkPreloads,
  )
}

export function buildStartManifest(options: {
  clientBuild: NormalizedClientBuild
  routeTreeRoutes: RouteTreeRoutes
  basePath: string
  additionalRouteAssets?: Partial<
    Record<string, ReadonlyArray<RouterManagedTag>>
  >
}): StartManifest {
  const scannedChunks = scanClientChunks(options.clientBuild)
  const assetResolvers = createManifestAssetResolvers(options.basePath)

  const routes = buildRouteManifestRoutes({
    routeTreeRoutes: options.routeTreeRoutes,
    routeChunksByFilePath: scannedChunks.routeChunksByFilePath,
    chunksByFileName: scannedChunks.chunksByFileName,
    entryChunk: scannedChunks.entryChunk,
    assetResolvers,
    additionalRouteAssets: options.additionalRouteAssets,
  })

  dedupeNestedRouteManifestEntries(rootRouteId, routes[rootRouteId]!, routes)

  // Prune routes with no assets or preloads from the manifest
  for (const routeId of Object.keys(routes)) {
    const route = routes[routeId]!
    const hasAssets = route.assets && route.assets.length > 0
    const hasPreloads = route.preloads && route.preloads.length > 0
    if (!hasAssets && !hasPreloads) {
      delete routes[routeId]
    }
  }

  return {
    routes,
    clientEntry: assetResolvers.getAssetPath(scannedChunks.entryChunk.fileName),
  }
}

export function serializeStartManifest(startManifest: StartManifest) {
  return serialize(startManifest)
}

export function scanClientChunks(
  clientBuild: NormalizedClientBuild,
): ScannedClientChunks {
  const entryChunk = clientBuild.chunksByFileName.get(
    clientBuild.entryChunkFileName,
  )

  if (!entryChunk) {
    throw new Error(`Missing entry chunk: ${clientBuild.entryChunkFileName}`)
  }

  const routeChunksByFilePath = new Map<string, Array<NormalizedClientChunk>>()

  for (const chunk of clientBuild.chunksByFileName.values()) {
    if (chunk.routeFilePaths.length > 0) {
      for (const routeFilePath of chunk.routeFilePaths) {
        let chunks = routeChunksByFilePath.get(routeFilePath)
        if (chunks === undefined) {
          chunks = []
          routeChunksByFilePath.set(routeFilePath, chunks)
        }
        chunks.push(chunk)
      }
    }
  }

  return {
    entryChunk,
    chunksByFileName: clientBuild.chunksByFileName,
    routeChunksByFilePath,
  }
}

export function createManifestAssetResolvers(
  basePath: string,
): ManifestAssetResolvers {
  const assetPathByFileName = new Map<string, string>()
  const stylesheetAssetByFileName = new Map<string, RouterManagedTag>()
  const preloadsByChunk = new Map<NormalizedClientChunk, Array<string>>()

  const getAssetPath = (fileName: string) => {
    const cachedPath = assetPathByFileName.get(fileName)
    if (cachedPath) {
      return cachedPath
    }

    const assetPath = joinURL(basePath, fileName)
    assetPathByFileName.set(fileName, assetPath)
    return assetPath
  }

  const getStylesheetAsset = (cssFile: string) => {
    const cachedAsset = stylesheetAssetByFileName.get(cssFile)
    if (cachedAsset) {
      return cachedAsset
    }

    const href = getAssetPath(cssFile)
    const asset = {
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href,
        type: 'text/css',
      },
    } satisfies RouterManagedTag

    stylesheetAssetByFileName.set(cssFile, asset)
    return asset
  }

  const getChunkPreloads = (chunk: NormalizedClientChunk) => {
    const cachedPreloads = preloadsByChunk.get(chunk)
    if (cachedPreloads) {
      return cachedPreloads
    }

    const preloads = [getAssetPath(chunk.fileName)]

    for (let i = 0; i < chunk.imports.length; i++) {
      preloads.push(getAssetPath(chunk.imports[i]!))
    }

    preloadsByChunk.set(chunk, preloads)
    return preloads
  }

  return {
    getAssetPath,
    getChunkPreloads,
    getStylesheetAsset,
  }
}

export function createChunkCssAssetCollector(options: {
  chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>
  getStylesheetAsset: (cssFile: string) => RouterManagedTag
}) {
  const assetsByChunk = new Map<
    NormalizedClientChunk,
    Array<RouterManagedTag>
  >()
  const stateByChunk = new Map<NormalizedClientChunk, number>()

  const appendAsset = (
    assets: Array<RouterManagedTag>,
    seenAssets: Set<RouterManagedTag>,
    asset: RouterManagedTag,
  ) => {
    if (seenAssets.has(asset)) {
      return
    }

    seenAssets.add(asset)
    assets.push(asset)
  }

  const getChunkCssAssets = (
    chunk: NormalizedClientChunk,
  ): Array<RouterManagedTag> => {
    const cachedAssets = assetsByChunk.get(chunk)
    if (cachedAssets) {
      return cachedAssets
    }

    if (stateByChunk.get(chunk) === VISITING_CHUNK) {
      return []
    }
    stateByChunk.set(chunk, VISITING_CHUNK)

    const assets: Array<RouterManagedTag> = []
    const seenAssets = new Set<RouterManagedTag>()

    for (let i = 0; i < chunk.imports.length; i++) {
      const importedChunk = options.chunksByFileName.get(chunk.imports[i]!)
      if (!importedChunk) {
        continue
      }

      const importedAssets = getChunkCssAssets(importedChunk)
      for (let j = 0; j < importedAssets.length; j++) {
        appendAsset(assets, seenAssets, importedAssets[j]!)
      }
    }

    for (const cssFile of chunk.css) {
      appendAsset(assets, seenAssets, options.getStylesheetAsset(cssFile))
    }

    stateByChunk.delete(chunk)
    assetsByChunk.set(chunk, assets)
    return assets
  }

  return { getChunkCssAssets }
}

export function buildRouteManifestRoutes(options: {
  routeTreeRoutes: RouteTreeRoutes
  routeChunksByFilePath: ReadonlyMap<
    string,
    ReadonlyArray<NormalizedClientChunk>
  >
  chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>
  entryChunk: NormalizedClientChunk
  assetResolvers: ManifestAssetResolvers
  additionalRouteAssets?: Partial<
    Record<string, ReadonlyArray<RouterManagedTag>>
  >
}) {
  const routes: Record<string, RouteTreeRoute> = {}
  const getChunkCssAssets = createChunkCssAssetCollector({
    chunksByFileName: options.chunksByFileName,
    getStylesheetAsset: options.assetResolvers.getStylesheetAsset,
  }).getChunkCssAssets

  for (const [routeId, route] of Object.entries(options.routeTreeRoutes)) {
    if (!route.filePath) {
      if (routeId === rootRouteId) {
        routes[routeId] = route
        continue
      }

      throw new Error(`expected filePath to be set for ${routeId}`)
    }

    const chunks = options.routeChunksByFilePath.get(route.filePath)
    if (!chunks) {
      routes[routeId] = route
      continue
    }

    const existing = routes[routeId]
    const targetRoute = (routes[routeId] = existing ? existing : { ...route })

    for (const chunk of chunks) {
      mergeRouteChunkData({
        route: targetRoute,
        chunk,
        getChunkCssAssets,
        getChunkPreloads: options.assetResolvers.getChunkPreloads,
      })
    }
  }

  const rootRoute = (routes[rootRouteId] = routes[rootRouteId] || {})
  mergeRouteChunkData({
    route: rootRoute,
    chunk: options.entryChunk,
    getChunkCssAssets,
    getChunkPreloads: options.assetResolvers.getChunkPreloads,
  })

  if (options.additionalRouteAssets) {
    for (const [routeId, assets] of Object.entries(
      options.additionalRouteAssets,
    )) {
      if (!assets || assets.length === 0) {
        continue
      }

      if (!(routeId in options.routeTreeRoutes)) {
        throw new Error(
          `expected additionalRouteAssets routeId to exist in routeTreeRoutes: ${routeId}`,
        )
      }

      const route = (routes[routeId] = routes[routeId] || {})
      route.assets = appendUniqueAssets(route.assets, [...assets])
    }
  }

  return routes
}

export {
  getRouteFilePathsFromModuleIds,
  normalizeViteClientBuild,
  normalizeViteClientChunk,
}

function dedupeNestedRouteManifestEntries(
  routeId: string,
  route: DedupeRoute,
  routesById: Record<string, DedupeRoute>,
  seenPreloads = new Set<string>(),
  seenAssets = new Set<string>(),
) {
  let routePreloads = route.preloads
  let routeAssets = route.assets

  if (routePreloads && routePreloads.length > 0) {
    let dedupedPreloads: Array<ManifestAssetLink> | undefined

    for (let i = 0; i < routePreloads.length; i++) {
      const preload = routePreloads[i]!
      const preloadHref = resolveManifestAssetLink(preload).href

      if (seenPreloads.has(preloadHref)) {
        if (dedupedPreloads === undefined) {
          dedupedPreloads = routePreloads.slice(0, i)
        }
        continue
      }

      seenPreloads.add(preloadHref)

      if (dedupedPreloads) {
        dedupedPreloads.push(preload)
      }
    }

    if (dedupedPreloads) {
      routePreloads = dedupedPreloads
      route.preloads = dedupedPreloads
    }
  }

  if (routeAssets && routeAssets.length > 0) {
    let dedupedAssets: Array<RouterManagedTag> | undefined

    for (let i = 0; i < routeAssets.length; i++) {
      const asset = routeAssets[i]!
      const identity = getAssetIdentity(asset)

      if (seenAssets.has(identity)) {
        if (dedupedAssets === undefined) {
          dedupedAssets = routeAssets.slice(0, i)
        }
        continue
      }

      seenAssets.add(identity)

      if (dedupedAssets) {
        dedupedAssets.push(asset)
      }
    }

    if (dedupedAssets) {
      routeAssets = dedupedAssets
      route.assets = dedupedAssets
    }
  }

  if (route.children) {
    for (const childRouteId of route.children) {
      const childRoute = routesById[childRouteId]

      if (!childRoute) {
        throw new Error(
          `Route tree references child route ${childRouteId} from ${routeId}, but no route entry was found`,
        )
      }

      dedupeNestedRouteManifestEntries(
        childRouteId,
        childRoute,
        routesById,
        seenPreloads,
        seenAssets,
      )
    }
  }

  if (routePreloads) {
    for (let i = routePreloads.length - 1; i >= 0; i--) {
      seenPreloads.delete(resolveManifestAssetLink(routePreloads[i]!).href)
    }
  }

  if (routeAssets) {
    for (let i = routeAssets.length - 1; i >= 0; i--) {
      seenAssets.delete(getAssetIdentity(routeAssets[i]!))
    }
  }
}
