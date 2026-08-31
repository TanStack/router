import { readFile } from 'node:fs/promises'
import { relative } from 'pathe'
import { tsrSplit } from '@tanstack/router-plugin'
import type { NormalizedClientBuild, NormalizedClientChunk } from '../types'

export interface BunClientOutputLike {
  path: string
  fileName: string
  kind: string
  /** Optional Bun input paths (may include ?tsr-split=...) when available. */
  inputs?: Array<{ path: string }>
  /** Absolute path to a sibling `.map` file when sourcemaps are linked. */
  sourcemapPath?: string
}

/**
 * Best-effort normalization of Bun.build client outputs into NormalizedClientBuild.
 *
 * Bun BuildArtifact does not expose Rollup-style module graphs, so routeFilePaths
 * are recovered from linked sourcemap `sources` (and optional `inputs`) that include
 * `?tsr-split=...` virtual modules.
 */
export function normalizeBunClientBuild(opts: {
  outputs: Array<BunClientOutputLike>
  clientOutDir: string
  /**
   * CSS assets emitted by `createCssAssetsPlugin` (source path + hashed file + content).
   * Wired into the Start manifest for route stylesheets / inlineCss.
   */
  emittedCssAssets?: Array<{
    sourcePath: string
    fileName: string
    css: string
  }>
}): NormalizedClientBuild {
  const chunksByFileName = new Map<string, NormalizedClientChunk>()
  const chunkFileNamesByRouteFilePath = new Map<string, Array<string>>()
  const cssFilesBySourcePath = new Map<string, Array<string>>()
  const cssContentByFileName = new Map<string, string>()
  let entryChunkFileName: string | undefined

  for (const artifact of opts.outputs) {
    const fileName = artifact.fileName.replace(/^\.\//, '')
    const kind = artifact.kind

    if (kind === 'asset' && fileName.endsWith('.css')) {
      cssContentByFileName.set(fileName, '')
      continue
    }

    if (kind !== 'entry-point' && kind !== 'chunk') {
      continue
    }

    const isEntry = kind === 'entry-point'
    const routeFilePaths = getRouteFilePathsFromInputs(artifact.inputs)

    chunksByFileName.set(fileName, {
      fileName,
      isEntry,
      imports: [],
      dynamicImports: [],
      css: [],
      routeFilePaths,
      hydrationIds: [],
    })

    for (const routeFilePath of routeFilePaths) {
      const existing = chunkFileNamesByRouteFilePath.get(routeFilePath) ?? []
      existing.push(fileName)
      chunkFileNamesByRouteFilePath.set(routeFilePath, existing)
    }

    if (isEntry && !entryChunkFileName) {
      entryChunkFileName = fileName
    }
  }

  if (!entryChunkFileName) {
    for (const fileName of chunksByFileName.keys()) {
      if (/\.(m?js)$/.test(fileName)) {
        entryChunkFileName = fileName
        const chunk = chunksByFileName.get(fileName)!
        chunksByFileName.set(fileName, { ...chunk, isEntry: true })
        break
      }
    }
  }

  if (!entryChunkFileName) {
    throw new Error(
      '[tanstack-start-bun] Could not determine client entry chunk from Bun.build outputs',
    )
  }

  const cssFileNames: Array<string> = []
  for (const asset of opts.emittedCssAssets ?? []) {
    const fileName = asset.fileName.replace(/^\.\//, '')
    if (!fileName.endsWith('.css')) {
      continue
    }
    cssContentByFileName.set(fileName, asset.css)
    if (!cssFileNames.includes(fileName)) {
      cssFileNames.push(fileName)
    }
    const existing = cssFilesBySourcePath.get(asset.sourcePath) ?? []
    if (!existing.includes(fileName)) {
      existing.push(fileName)
    }
    cssFilesBySourcePath.set(asset.sourcePath, existing)
  }

  // Bun BuildArtifact has no Rollup module graph — attach emitted CSS to the entry
  // chunk so Start SSR still injects stylesheet links / inlineCss content.
  if (cssFileNames.length > 0) {
    const entry = chunksByFileName.get(entryChunkFileName)
    if (entry) {
      entry.css = [...new Set([...entry.css, ...cssFileNames])]
    }
  }

  return {
    entryChunkFileName,
    chunksByFileName,
    chunkFileNamesByRouteFilePath,
    cssFilesBySourcePath,
    cssContentByFileName,
  }
}

/**
 * Enrich a NormalizedClientBuild by reading linked `.js.map` sources next to outputs.
 */
export async function enrichBunClientBuildFromSourcemaps(opts: {
  clientBuild: NormalizedClientBuild
  outputs: Array<BunClientOutputLike>
}): Promise<NormalizedClientBuild> {
  const chunksByFileName = new Map(opts.clientBuild.chunksByFileName)
  const chunkFileNamesByRouteFilePath = new Map(
    [...opts.clientBuild.chunkFileNamesByRouteFilePath.entries()].map(
      ([key, value]) => [key, [...value]] as [string, Array<string>],
    ),
  )

  for (const artifact of opts.outputs) {
    if (artifact.kind !== 'entry-point' && artifact.kind !== 'chunk') {
      continue
    }
    const fileName = artifact.fileName.replace(/^\.\//, '')
    const chunk = chunksByFileName.get(fileName)
    if (!chunk) {
      continue
    }

    const mapPath = artifact.sourcemapPath ?? `${artifact.path}.map`
    const sources = await readSourcemapSources(mapPath)
    if (!sources.length) {
      continue
    }

    const routeFilePaths = getRouteFilePathsFromInputs(
      sources.map((path) => ({ path })),
    )
    if (!routeFilePaths.length) {
      continue
    }

    const merged = [...new Set([...chunk.routeFilePaths, ...routeFilePaths])]
    chunksByFileName.set(fileName, {
      ...chunk,
      routeFilePaths: merged,
    })

    for (const routeFilePath of routeFilePaths) {
      const existing = chunkFileNamesByRouteFilePath.get(routeFilePath) ?? []
      if (!existing.includes(fileName)) {
        existing.push(fileName)
      }
      chunkFileNamesByRouteFilePath.set(routeFilePath, existing)
    }
  }

  return {
    ...opts.clientBuild,
    chunksByFileName,
    chunkFileNamesByRouteFilePath,
  }
}

/** Relativize an absolute output path to the client out dir. */
export function toClientRelativeFileName(
  absolutePath: string,
  clientOutDir: string,
): string {
  const rel = relative(clientOutDir, absolutePath)
  return rel.replace(/\\/g, '/')
}

/** Collect route file paths from Bun build inputs / sourcemaps. */
export function getRouteFilePathsFromInputs(
  inputs: Array<{ path: string }> | undefined,
): Array<string> {
  if (!inputs?.length) {
    return []
  }

  const paths: Array<string> = []
  const seen = new Set<string>()

  for (const input of inputs) {
    const routeFilePath = extractRouteFilePathFromSource(input.path)
    if (!routeFilePath || seen.has(routeFilePath)) {
      continue
    }
    seen.add(routeFilePath)
    paths.push(routeFilePath)
  }

  return paths
}

/** Extract a route path from a `?tsr-split=` source id. */
function extractRouteFilePathFromSource(id: string): string | undefined {
  // Bun sourcemaps often prefix virtual namespaces: tsr-split:/abs/path?tsr-split=...
  let normalized = id
  const ns = normalized.indexOf(':/')
  if (
    ns > 0 &&
    !normalized.startsWith('/') &&
    !normalized.startsWith('file:')
  ) {
    // Keep absolute path after "namespace:"
    const after = normalized.slice(ns + 1)
    if (after.startsWith('/')) {
      normalized = after
    }
  }

  const queryIndex = normalized.indexOf('?')
  if (queryIndex < 0) {
    return undefined
  }
  const query = normalized.slice(queryIndex + 1)
  if (!query.includes(tsrSplit)) {
    return undefined
  }
  if (!new URLSearchParams(query).has(tsrSplit)) {
    return undefined
  }
  return normalized.slice(0, queryIndex)
}

/** Read the `sources` array from a linked `.js.map` file. */
async function readSourcemapSources(mapPath: string): Promise<Array<string>> {
  try {
    const raw = await readFile(mapPath, 'utf8')
    const parsed = JSON.parse(raw) as { sources?: Array<string> }
    return parsed.sources ?? []
  } catch {
    return []
  }
}
