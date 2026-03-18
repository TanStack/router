/* eslint-disable @typescript-eslint/prefer-for-of */
import { joinURL } from 'ufo'
import { rootRouteId } from '@tanstack/router-core'
import { tsrSplit } from '@tanstack/router-plugin'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { Rollup } from 'vite'

const ROUTER_MANAGED_MODE = 1
const NON_ROUTE_DYNAMIC_MODE = 2
const VISITING_CHUNK = 1

type RouteTreeRoute = {
  filePath?: string
  preloads?: Array<string>
  assets?: Array<RouterManagedTag>
  children?: Array<string>
}

type RouteTreeRoutes = Record<string, RouteTreeRoute>

interface ScannedClientChunks {
  entryChunk: Rollup.OutputChunk
  chunksByFileName: Map<string, Rollup.OutputChunk>
  routeChunksByFilePath: Map<string, Array<Rollup.OutputChunk>>
  routeEntryChunks: Set<Rollup.OutputChunk>
}

interface ManifestAssetResolvers {
  getAssetPath: (fileName: string) => string
  getChunkPreloads: (chunk: Rollup.OutputChunk) => Array<string>
  getStylesheetAsset: (cssFile: string) => RouterManagedTag
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
  if (asset.tag === 'link' || asset.tag === 'script') {
    const attrs = asset.attrs ?? {}
    return [
      asset.tag,
      'href' in attrs ? String(attrs.href) : '',
      'src' in attrs ? String(attrs.src) : '',
      'rel' in attrs ? String(attrs.rel) : '',
      'type' in attrs ? String(attrs.type) : '',
      asset.children ?? '',
    ].join('|')
  }

  return JSON.stringify(asset)
}

function mergeRouteChunkData(options: {
  route: RouteTreeRoute
  chunk: Rollup.OutputChunk
  getChunkCssAssets: (chunk: Rollup.OutputChunk) => Array<RouterManagedTag>
  getChunkPreloads: (chunk: Rollup.OutputChunk) => Array<string>
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
  clientBundle: Rollup.OutputBundle
  routeTreeRoutes: RouteTreeRoutes
  basePath: string
}) {
  const scannedChunks = scanClientChunks(options.clientBundle)
  const hashedCssFiles = collectDynamicImportCss(
    scannedChunks.routeEntryChunks,
    scannedChunks.chunksByFileName,
    scannedChunks.entryChunk,
  )
  const assetResolvers = createManifestAssetResolvers({
    basePath: options.basePath,
    hashedCssFiles,
  })

  const routes = buildRouteManifestRoutes({
    routeTreeRoutes: options.routeTreeRoutes,
    routeChunksByFilePath: scannedChunks.routeChunksByFilePath,
    chunksByFileName: scannedChunks.chunksByFileName,
    entryChunk: scannedChunks.entryChunk,
    assetResolvers,
  })

  dedupeNestedRoutePreloads(routes[rootRouteId]!, routes)

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

export function scanClientChunks(
  clientBundle: Rollup.OutputBundle,
): ScannedClientChunks {
  let entryChunk: Rollup.OutputChunk | undefined
  const chunksByFileName = new Map<string, Rollup.OutputChunk>()
  const routeChunksByFilePath = new Map<string, Array<Rollup.OutputChunk>>()
  const routeEntryChunks = new Set<Rollup.OutputChunk>()

  for (const fileName in clientBundle) {
    const bundleEntry = clientBundle[fileName]!
    if (bundleEntry.type !== 'chunk') {
      continue
    }

    chunksByFileName.set(bundleEntry.fileName, bundleEntry)

    if (bundleEntry.isEntry) {
      if (entryChunk) {
        throw new Error(
          `multiple entries detected: ${entryChunk.fileName} ${bundleEntry.fileName}`,
        )
      }
      entryChunk = bundleEntry
    }

    const routeFilePaths = getRouteFilePathsFromModuleIds(bundleEntry.moduleIds)
    if (routeFilePaths.length === 0) {
      continue
    }

    routeEntryChunks.add(bundleEntry)

    for (let i = 0; i < routeFilePaths.length; i++) {
      const routeFilePath = routeFilePaths[i]!
      let chunks = routeChunksByFilePath.get(routeFilePath)
      if (chunks === undefined) {
        chunks = []
        routeChunksByFilePath.set(routeFilePath, chunks)
      }
      chunks.push(bundleEntry)
    }
  }

  if (!entryChunk) {
    throw new Error('No entry file found')
  }

  return {
    entryChunk,
    chunksByFileName,
    routeChunksByFilePath,
    routeEntryChunks,
  }
}

export function getRouteFilePathsFromModuleIds(moduleIds: Array<string>) {
  let routeFilePaths: Array<string> | undefined
  let seenRouteFilePaths: Set<string> | undefined

  for (const moduleId of moduleIds) {
    const queryIndex = moduleId.indexOf('?')

    if (queryIndex < 0) {
      continue
    }

    const query = moduleId.slice(queryIndex + 1)

    // Fast check before allocating URLSearchParams
    if (!query.includes(tsrSplit)) {
      continue
    }

    if (!new URLSearchParams(query).has(tsrSplit)) {
      continue
    }

    const routeFilePath = moduleId.slice(0, queryIndex)

    if (seenRouteFilePaths?.has(routeFilePath)) {
      continue
    }

    if (routeFilePaths === undefined) {
      routeFilePaths = []
      seenRouteFilePaths = new Set<string>()
    }

    routeFilePaths.push(routeFilePath)
    seenRouteFilePaths!.add(routeFilePath)
  }

  return routeFilePaths ?? []
}

export function collectDynamicImportCss(
  routeEntryChunks: Set<Rollup.OutputChunk>,
  chunksByFileName: Map<string, Rollup.OutputChunk>,
  entryChunk?: Rollup.OutputChunk,
) {
  const routerManagedCssFiles = new Set<string>()
  const nonRouteDynamicCssFiles = new Set<string>()
  const hashedCssFiles = new Set<string>()
  const visitedByChunk = new Map<Rollup.OutputChunk, number>()
  const chunkStack: Array<Rollup.OutputChunk> = []
  const modeStack: Array<number> = []

  for (const routeEntryChunk of routeEntryChunks) {
    chunkStack.push(routeEntryChunk)
    modeStack.push(ROUTER_MANAGED_MODE)
  }

  if (entryChunk) {
    chunkStack.push(entryChunk)
    modeStack.push(ROUTER_MANAGED_MODE)
  }

  while (chunkStack.length > 0) {
    const chunk = chunkStack.pop()!
    const mode = modeStack.pop()!
    const previousMode = visitedByChunk.get(chunk) ?? 0

    if ((previousMode & mode) === mode) {
      continue
    }

    visitedByChunk.set(chunk, previousMode | mode)

    if ((mode & ROUTER_MANAGED_MODE) !== 0) {
      for (const cssFile of chunk.viteMetadata?.importedCss ?? []) {
        routerManagedCssFiles.add(cssFile)
      }
    }

    if ((mode & NON_ROUTE_DYNAMIC_MODE) !== 0) {
      for (const cssFile of chunk.viteMetadata?.importedCss ?? []) {
        nonRouteDynamicCssFiles.add(cssFile)
      }
    }

    for (let i = 0; i < chunk.imports.length; i++) {
      const importedChunk = chunksByFileName.get(chunk.imports[i]!)
      if (importedChunk) {
        chunkStack.push(importedChunk)
        modeStack.push(mode)
      }
    }

    for (let i = 0; i < chunk.dynamicImports.length; i++) {
      const dynamicImportedChunk = chunksByFileName.get(
        chunk.dynamicImports[i]!,
      )
      if (dynamicImportedChunk) {
        chunkStack.push(dynamicImportedChunk)
        modeStack.push(
          (mode & NON_ROUTE_DYNAMIC_MODE) !== 0 ||
            !routeEntryChunks.has(dynamicImportedChunk)
            ? NON_ROUTE_DYNAMIC_MODE
            : ROUTER_MANAGED_MODE,
        )
      }
    }
  }

  for (const cssFile of routerManagedCssFiles) {
    if (nonRouteDynamicCssFiles.has(cssFile)) {
      hashedCssFiles.add(cssFile)
    }
  }

  return hashedCssFiles
}

export function createManifestAssetResolvers(options: {
  basePath: string
  hashedCssFiles?: Set<string>
}): ManifestAssetResolvers {
  const assetPathByFileName = new Map<string, string>()
  const stylesheetAssetByFileName = new Map<string, RouterManagedTag>()
  const preloadsByChunk = new Map<Rollup.OutputChunk, Array<string>>()

  const getAssetPath = (fileName: string) => {
    const cachedPath = assetPathByFileName.get(fileName)
    if (cachedPath) {
      return cachedPath
    }

    const assetPath = joinURL(options.basePath, fileName)
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
        href: options.hashedCssFiles?.has(cssFile) ? `${href}#` : href,
        type: 'text/css',
      },
    } satisfies RouterManagedTag

    stylesheetAssetByFileName.set(cssFile, asset)
    return asset
  }

  const getChunkPreloads = (chunk: Rollup.OutputChunk) => {
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
  chunksByFileName: Map<string, Rollup.OutputChunk>
  getStylesheetAsset: (cssFile: string) => RouterManagedTag
}) {
  const assetsByChunk = new Map<Rollup.OutputChunk, Array<RouterManagedTag>>()
  const stateByChunk = new Map<Rollup.OutputChunk, number>()

  const getChunkCssAssets = (
    chunk: Rollup.OutputChunk,
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

    for (const cssFile of chunk.viteMetadata?.importedCss ?? []) {
      assets.push(options.getStylesheetAsset(cssFile))
    }

    for (let i = 0; i < chunk.imports.length; i++) {
      const importedChunk = options.chunksByFileName.get(chunk.imports[i]!)
      if (!importedChunk) {
        continue
      }

      const importedAssets = getChunkCssAssets(importedChunk)
      for (let j = 0; j < importedAssets.length; j++) {
        assets.push(importedAssets[j]!)
      }
    }

    stateByChunk.delete(chunk)
    assetsByChunk.set(chunk, assets)
    return assets
  }

  return { getChunkCssAssets }
}

export function buildRouteManifestRoutes(options: {
  routeTreeRoutes: RouteTreeRoutes
  routeChunksByFilePath: Map<string, Array<Rollup.OutputChunk>>
  chunksByFileName: Map<string, Rollup.OutputChunk>
  entryChunk: Rollup.OutputChunk
  assetResolvers: ManifestAssetResolvers
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

  return routes
}

export function dedupeNestedRoutePreloads(
  route: { preloads?: Array<string>; children?: Array<string> },
  routesById: Record<string, RouteTreeRoute>,
  seenPreloads = new Set<string>(),
) {
  let routePreloads = route.preloads

  if (routePreloads && routePreloads.length > 0) {
    let dedupedPreloads: Array<string> | undefined

    for (let i = 0; i < routePreloads.length; i++) {
      const preload = routePreloads[i]!
      if (seenPreloads.has(preload)) {
        if (dedupedPreloads === undefined) {
          dedupedPreloads = routePreloads.slice(0, i)
        }
        continue
      }

      seenPreloads.add(preload)

      if (dedupedPreloads) {
        dedupedPreloads.push(preload)
      }
    }

    if (dedupedPreloads) {
      routePreloads = dedupedPreloads
      route.preloads = dedupedPreloads
    }
  }

  if (route.children) {
    for (const childRouteId of route.children) {
      dedupeNestedRoutePreloads(
        routesById[childRouteId]!,
        routesById,
        seenPreloads,
      )
    }
  }

  if (routePreloads) {
    for (let i = routePreloads.length - 1; i >= 0; i--) {
      seenPreloads.delete(routePreloads[i]!)
    }
  }
}
