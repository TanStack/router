import { normalizePath } from 'vite'
import { tsrSplit } from '@tanstack/router-plugin'
import { tssHydrate } from '../../hydration-constants'
import { getCssAssetSource } from '../../start-manifest-plugin/inlineCss'
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

export function normalizeViteClientBuild(
  clientBundle: Rollup.OutputBundle,
  opts?: { clientEntryModuleId?: string },
): NormalizedClientBuild {
  const chunksByFileName = normalizeViteClientChunks(clientBundle)
  const chunkFileNamesByRouteFilePath = new Map<string, Array<string>>()
  const cssFilesBySourcePath = new Map<string, Array<string>>()
  const cssContentByFileName = new Map<string, string>()
  const entryChunks: Array<Rollup.OutputChunk> = []

  for (const chunk of chunksByFileName.values()) {
    const bundleEntry = clientBundle[chunk.fileName] as Rollup.OutputChunk

    if (chunk.isEntry) {
      entryChunks.push(bundleEntry)
    }

    for (const routeFilePath of chunk.routeFilePaths) {
      let chunkFileNames = chunkFileNamesByRouteFilePath.get(routeFilePath)
      if (chunkFileNames === undefined) {
        chunkFileNames = []
        chunkFileNamesByRouteFilePath.set(routeFilePath, chunkFileNames)
      }
      chunkFileNames.push(chunk.fileName)
    }

    for (const moduleId of bundleEntry.moduleIds) {
      const queryIndex = moduleId.indexOf('?')
      const sourcePath =
        queryIndex >= 0 ? moduleId.slice(0, queryIndex) : moduleId
      if (!sourcePath) continue

      const existing = cssFilesBySourcePath.get(sourcePath)
      cssFilesBySourcePath.set(
        sourcePath,
        existing
          ? Array.from(new Set([...existing, ...chunk.css]))
          : chunk.css.slice(),
      )
    }
  }

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

  const entryChunkFileName = selectEntryChunkFileName(
    entryChunks,
    opts?.clientEntryModuleId,
  )

  return {
    entryChunkFileName,
    chunksByFileName,
    chunkFileNamesByRouteFilePath,
    cssFilesBySourcePath,
    cssContentByFileName,
  }
}

// Plugins may emit their own entry chunks into the client build (e.g.
// vite-plugin-solid >= 3.0.0-next.6 emits a facade chunk per dynamically
// imported project module to keep its manifest lookups stable). Those emitted
// chunks are flagged `isEntry` just like the configured entry, so the real
// entry must be picked by matching its facade module against the resolved
// client entry path instead of asserting there is exactly one entry.
function selectEntryChunkFileName(
  entryChunks: Array<Rollup.OutputChunk>,
  clientEntryModuleId: string | undefined,
): string {
  if (clientEntryModuleId !== undefined) {
    const normalizedEntryModuleId = normalizePath(clientEntryModuleId)
    const matching = entryChunks.filter(
      (chunk) =>
        chunk.facadeModuleId !== null &&
        normalizePath(chunk.facadeModuleId) === normalizedEntryModuleId,
    )

    if (matching.length === 1) {
      return matching[0]!.fileName
    }

    if (matching.length > 1) {
      throw new Error(
        `multiple client entry chunks matched ${clientEntryModuleId}: ${matching
          .map((chunk) => chunk.fileName)
          .join(', ')}`,
      )
    }
  }

  if (entryChunks.length === 1) {
    return entryChunks[0]!.fileName
  }

  if (entryChunks.length === 0) {
    throw new Error('No entry file found')
  }

  throw new Error(
    `multiple entries detected: ${entryChunks
      .map((chunk) => `${chunk.fileName} (${chunk.facadeModuleId ?? 'unknown module'})`)
      .join(', ')}`,
  )
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
