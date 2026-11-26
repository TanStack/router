import { tssHydrate } from '../../hydration-constants'
import { getCssAssetSource } from '../../start-manifest-plugin/inlineCss'
import { isRouteSplitQuery } from '../../start-manifest-plugin/routeChunks'
import type { Rollup } from 'vite'
import type { NormalizedClientBuild, NormalizedClientChunk } from '../../types'

export function normalizeViteClientChunk(
  chunk: Rollup.OutputChunk,
): NormalizedClientChunk {
  return {
    fileName: chunk.fileName,
    isEntry: chunk.isEntry,
    imports: chunk.imports,
    dynamicImports: chunk.dynamicImports,
    css: Array.from(chunk.viteMetadata?.importedCss ?? []),
    routeFilePaths: getRouteFilePathsFromModuleIds(chunk.moduleIds),
    hydrationIds: getHydrationIdsFromModuleIds(chunk.moduleIds),
  }
}

export function normalizeViteClientChunks(
  clientBundle: Rollup.OutputBundle,
): ReadonlyMap<string, NormalizedClientChunk> {
  const chunksByFileName = new Map<string, NormalizedClientChunk>()

  for (const fileName in clientBundle) {
    const bundleEntry = clientBundle[fileName]!
    if (bundleEntry.type !== 'chunk') {
      continue
    }

    const normalizedChunk = normalizeViteClientChunk(bundleEntry)
    chunksByFileName.set(normalizedChunk.fileName, normalizedChunk)
  }

  return chunksByFileName
}

/**
 * The client bundle's one entry chunk: a bundle with none, or several (a
 * second input or output of the client), is not a client build Start can
 * describe. Asked before the bundle is written too: a rejected build writes
 * nothing.
 */
export function clientEntryOf(clientBundle: Rollup.OutputBundle): string {
  let entryChunkFileName: string | undefined
  for (const output of Object.values(clientBundle)) {
    if (output.type === 'chunk' && output.isEntry) {
      if (entryChunkFileName) {
        throw new Error(
          `multiple entries detected: ${entryChunkFileName} ${output.fileName}`,
        )
      }
      entryChunkFileName = output.fileName
    }
  }
  if (!entryChunkFileName) {
    throw new Error('No entry file found')
  }
  return entryChunkFileName
}

export function normalizeViteClientBuild(
  clientBundle: Rollup.OutputBundle,
  inlineCssEnabled = false,
): NormalizedClientBuild {
  const entryChunkFileName = clientEntryOf(clientBundle)
  const chunksByFileName = normalizeViteClientChunks(clientBundle)
  let cssContentByFileName: Map<string, string> | undefined

  if (inlineCssEnabled) {
    cssContentByFileName = new Map()
    for (const fileName in clientBundle) {
      if (!fileName.endsWith('.css')) {
        continue
      }

      const bundleEntry = clientBundle[fileName]!
      if (bundleEntry.type !== 'asset') {
        continue
      }

      const css = getCssAssetSource(bundleEntry.source)
      if (css !== undefined) {
        cssContentByFileName.set(fileName, css)
      }
    }
  }

  return {
    entryChunkFileName,
    chunksByFileName,
    cssContentByFileName,
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

    if (!isRouteSplitQuery(moduleId.slice(queryIndex + 1))) {
      continue
    }

    const routeFilePath = moduleId.slice(0, queryIndex)

    if (seenRouteFilePaths?.has(routeFilePath)) {
      continue
    }

    if (routeFilePaths === undefined || seenRouteFilePaths === undefined) {
      routeFilePaths = []
      seenRouteFilePaths = new Set<string>()
    }

    routeFilePaths.push(routeFilePath)
    seenRouteFilePaths.add(routeFilePath)
  }

  return routeFilePaths ?? []
}

export function getHydrationIdsFromModuleIds(moduleIds: Array<string>) {
  let hydrationIds: Array<string> | undefined
  let seen: Set<string> | undefined

  for (const moduleId of moduleIds) {
    const queryIndex = moduleId.indexOf('?')

    if (queryIndex < 0) {
      continue
    }

    const query = moduleId.slice(queryIndex + 1)

    if (!query.includes(tssHydrate)) {
      continue
    }

    const hydrationId = new URLSearchParams(query).get(tssHydrate)

    if (!hydrationId || seen?.has(hydrationId)) {
      continue
    }

    if (hydrationIds === undefined || seen === undefined) {
      hydrationIds = []
      seen = new Set<string>()
    }

    hydrationIds.push(hydrationId)
    seen.add(hydrationId)
  }

  return hydrationIds ?? []
}
