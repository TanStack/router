import { tsrSplit } from '@tanstack/router-plugin'
import { tssHydrate } from '../hydration-constants'
import { getCssAssetSource } from '../start-manifest-plugin/inlineCss'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type {
  GetConfigFn,
  NormalizedClientBuild,
  NormalizedClientChunk,
} from '../types'

type ProcessAssetsContext = Parameters<
  Parameters<RsbuildPluginAPI['processAssets']>[1]
>[0]
type RspackCompilation = Rspack.Compilation
type RspackCompilationChunk = Rspack.Chunk
type RspackModule = Rspack.Module

const backslashRegex = /\\/g

/**
 * Convert an OS native path to the POSIX form used by the generated route tree.
 */
function toPosixPath(filePath: string): string {
  return filePath.replace(backslashRegex, '/')
}

/**
 * Extract route file paths from rspack module identifiers.
 *
 * In rspack, module identifiers contain query params similar to Vite's moduleIds.
 * We look for the `tsr-split` query to identify route-split chunks.
 */
function getRouteFilePathsFromModules(
  modules: Array<RspackModule>,
): Array<string> {
  let routeFilePaths: Array<string> | undefined
  let seen: Set<string> | undefined

  for (const mod of modules) {
    const identifier = mod.identifier()

    // rspack module identifiers include loader prefixes separated by '!'.
    // The actual file path (with query string) is after the last '!'.
    // Example: "builtin:swc-loader??ruleSet[...]!.../transform.js??...!.../rsc-basic.tsx?tsr-split=component"
    const lastBangIndex = identifier.lastIndexOf('!')
    const resourcePart =
      lastBangIndex >= 0 ? identifier.slice(lastBangIndex + 1) : identifier

    const queryIndex = resourcePart.indexOf('?')
    if (queryIndex < 0) continue

    const query = resourcePart.slice(queryIndex + 1)
    if (!query.includes(tsrSplit)) continue
    if (!new URLSearchParams(query).has(tsrSplit)) continue

    const nameForCondition = mod.nameForCondition()

    // rspack reports module paths using the OS separator, while the generated route
    // tree records every route `filePath` with POSIX separators. Normalize before the
    // path becomes a manifest key, otherwise no route matches its chunk on Windows and
    // every route loses its stylesheets and preloads.
    const routeFilePath = toPosixPath(
      nameForCondition ?? resourcePart.slice(0, queryIndex),
    )

    if (seen?.has(routeFilePath)) continue

    if (!routeFilePaths || !seen) {
      routeFilePaths = []
      seen = new Set()
    }

    routeFilePaths.push(routeFilePath)
    seen.add(routeFilePath)
  }

  return routeFilePaths ?? []
}

function getHydrationIdsFromModules(
  modules: Array<RspackModule>,
): Array<string> {
  let hydrationIds: Array<string> | undefined
  let seen: Set<string> | undefined

  for (const mod of modules) {
    const identifier = mod.identifier()
    const lastBangIndex = identifier.lastIndexOf('!')
    const resourcePart =
      lastBangIndex >= 0 ? identifier.slice(lastBangIndex + 1) : identifier

    const queryIndex = resourcePart.indexOf('?')
    if (queryIndex < 0) continue

    const query = resourcePart.slice(queryIndex + 1)
    if (!query.includes(tssHydrate)) continue

    const hydrationId = new URLSearchParams(query).get(tssHydrate)
    if (!hydrationId || seen?.has(hydrationId)) continue

    if (!hydrationIds || !seen) {
      hydrationIds = []
      seen = new Set()
    }

    hydrationIds.push(hydrationId)
    seen.add(hydrationId)
  }

  return hydrationIds ?? []
}

/**
 * Substring checks admit a superset of chunks; the extractors still decide.
 * Relies on every getChunkModules module (including a production ConcatenatedModule
 * root) being in compilation.modules and reporting its chunk via getModuleChunks.
 * Rspack must return the same chunk objects as compilation.chunks, as entryChunkSet
 * already requires.
 */
function findRouteAndHydrationChunks(
  compilation: RspackCompilation,
): Set<RspackCompilationChunk> {
  const routeAndHydrationChunks = new Set<RspackCompilationChunk>()
  for (const mod of compilation.modules) {
    const identifier = mod.identifier()
    if (identifier.includes(tsrSplit) || identifier.includes(tssHydrate)) {
      for (const chunk of compilation.chunkGraph.getModuleChunks(mod)) {
        routeAndHydrationChunks.add(chunk)
      }
    }
  }
  return routeAndHydrationChunks
}

/**
 * Returns true for Rspack/webpack HMR runtime chunks that should never be
 * surfaced to the Start manifest. These files are emitted on every rebuild
 * (e.g. `index.<hash>.hot-update.mjs`) and must not be treated as the entry
 * chunk, route preloads, or sibling imports.
 */
function isHotUpdateAsset(file: string): boolean {
  return file.includes('.hot-update.')
}

/**
 * True for any JS/MJS asset that should be included in the manifest.
 * Excludes HMR runtime patches.
 */
function isManifestJsAsset(file: string): boolean {
  if (!file.endsWith('.js') && !file.endsWith('.mjs')) {
    return false
  }
  return !isHotUpdateAsset(file)
}

function memoizeGraphRead<TTarget extends object, TValue>(
  read: (target: TTarget) => Array<TValue>,
): (target: TTarget) => Array<TValue> {
  const cache = new Map<TTarget, Array<TValue>>()
  return (target) => {
    let value = cache.get(target)
    if (!value) {
      value = read(target)
      cache.set(target, value)
    }
    return value
  }
}

function mergeJsFiles(
  fileLists: Array<Array<string>>,
  currentFile?: string,
): Array<string> {
  const files: Array<string> = []
  const seen = new Set(currentFile === undefined ? [] : [currentFile])
  for (const list of fileLists) {
    for (const file of list) {
      if (!seen.has(file)) {
        seen.add(file)
        files.push(file)
      }
    }
  }
  return files
}

/**
 * Rspack's graph getters allocate collections on each read. Keep this cache local
 * to one capture so rebuilds see fresh graph data.
 */
function createChunkGraphReader() {
  const getFiles = memoizeGraphRead((chunk: RspackCompilationChunk) =>
    Array.from(chunk.files),
  )
  const getAuxiliaryFiles = memoizeGraphRead((chunk: RspackCompilationChunk) =>
    Array.from(chunk.auxiliaryFiles),
  )
  const getGroups = memoizeGraphRead((chunk: RspackCompilationChunk) =>
    Array.from(chunk.groupsIterable),
  )
  const getGroupChunks = memoizeGraphRead((group: Rspack.ChunkGroup) =>
    Array.from(group.chunks),
  )
  const getChildren = memoizeGraphRead((group: Rspack.ChunkGroup) =>
    Array.from(group.childrenIterable),
  )
  const getChunkJsFiles = memoizeGraphRead((chunk: RspackCompilationChunk) =>
    getFiles(chunk).filter(isManifestJsAsset),
  )

  // Each group supplies its sibling imports and its direct dynamic-import edges.
  // Deduping within a group before merging preserves global first-occurrence order.
  const getGroupJsFiles = memoizeGraphRead((group: Rspack.ChunkGroup) =>
    mergeJsFiles(getGroupChunks(group).map(getChunkJsFiles)),
  )
  const getChildGroupJsFiles = memoizeGraphRead((group: Rspack.ChunkGroup) =>
    mergeJsFiles(getChildren(group).map(getGroupJsFiles)),
  )

  return {
    getFiles,
    getAuxiliaryFiles,
    getGroupChunks,
    getChunkJsFiles,
    // Child groups are import() points; their chunks' JS is Rollup's dynamicImports.
    computeDynamicImports(chunk: RspackCompilationChunk) {
      return mergeJsFiles(getGroups(chunk).map(getChildGroupJsFiles))
    },
    // A group holds every chunk needed for an import, so its other chunks are
    // static imports, analogous to Rollup's imports.
    computeAsyncChunkImports(
      chunk: RspackCompilationChunk,
      currentFile: string,
    ) {
      return mergeJsFiles(getGroups(chunk).map(getGroupJsFiles), currentFile)
    },
  }
}

/**
 * Normalize an rspack compilation into a NormalizedClientBuild.
 *
 * Iterates ALL chunks in the compilation (initial + async), not just
 * entrypoint chunks, to ensure route-split async chunks are included.
 */
export function normalizeRspackClientBuild(
  compilation: RspackCompilation,
  inlineCssEnabled = false,
): NormalizedClientBuild {
  const {
    getFiles,
    getAuxiliaryFiles,
    getGroupChunks,
    getChunkJsFiles,
    computeDynamicImports,
    computeAsyncChunkImports,
  } = createChunkGraphReader()
  const chunksByFileName = new Map<string, NormalizedClientChunk>()
  let cssContentByFileName: Map<string, string> | undefined
  let entryChunkFileName: string | undefined

  // Collect all initial JS file names from the main entry for computing
  // the entry chunk's `imports` (vendor/shared sibling chunks).
  const entrypoint = compilation.entrypoints.get('index')
  const initialJsFileNames: Array<string> = []
  const entryChunkSet = new Set<RspackCompilationChunk>()
  if (entrypoint) {
    for (const chunk of getGroupChunks(entrypoint)) {
      entryChunkSet.add(chunk)
      initialJsFileNames.push(...getChunkJsFiles(chunk))
    }
  }

  const routeAndHydrationChunks = findRouteAndHydrationChunks(compilation)

  // Iterate ALL chunks (initial + async) to capture route-split chunks
  for (const chunk of compilation.chunks) {
    const modules = routeAndHydrationChunks.has(chunk)
      ? compilation.chunkGraph.getChunkModules(chunk)
      : undefined
    const routeFilePaths = modules ? getRouteFilePathsFromModules(modules) : []
    const hydrationIds = modules ? getHydrationIdsFromModules(modules) : []
    const cssFiles: Array<string> = []
    const seenCssFiles = new Set<string>()

    for (const auxFile of getAuxiliaryFiles(chunk)) {
      if (auxFile.endsWith('.css') && !seenCssFiles.has(auxFile)) {
        seenCssFiles.add(auxFile)
        cssFiles.push(auxFile)
      }
    }

    for (const mainFile of getFiles(chunk)) {
      if (mainFile.endsWith('.css') && !seenCssFiles.has(mainFile)) {
        seenCssFiles.add(mainFile)
        cssFiles.push(mainFile)
      }
    }

    // The entry chunk is the one named 'index' in the 'index' entrypoint
    const isEntryChunk = chunk.name === 'index' && entryChunkSet.has(chunk)

    const jsFiles = getChunkJsFiles(chunk)
    if (jsFiles.length === 0) {
      continue
    }

    // Compute dynamicImports from chunk group children
    const dynamicImports = computeDynamicImports(chunk)

    for (const file of jsFiles) {
      // For the entry chunk, `imports` contains all sibling initial chunks
      // (vendor/shared). For async chunks, `imports` contains all sibling
      // chunks from the ChunkGroup (shared dependencies the browser must
      // load alongside this chunk). This mirrors Rollup's
      // OutputChunk.imports which lists statically imported chunks.
      const imports = isEntryChunk
        ? initialJsFileNames.filter((f) => f !== file)
        : computeAsyncChunkImports(chunk, file)

      const normalizedChunk: NormalizedClientChunk = {
        fileName: file,
        isEntry: isEntryChunk,
        imports,
        dynamicImports,
        css: [],
        routeFilePaths,
        hydrationIds,
      }

      chunksByFileName.set(file, normalizedChunk)

      if (isEntryChunk && !entryChunkFileName) {
        entryChunkFileName = file
      }
    }

    for (const cssFile of cssFiles) {
      for (const file of jsFiles) {
        const existing = chunksByFileName.get(file)
        if (existing && !existing.css.includes(cssFile)) {
          existing.css.push(cssFile)
        }
      }
    }
  }

  if (!entryChunkFileName) {
    throw new Error('No entry file found in rspack client build')
  }

  if (inlineCssEnabled) {
    cssContentByFileName = new Map()
    for (const asset of compilation.getAssets()) {
      if (!asset.name.endsWith('.css')) {
        continue
      }

      const css = getCssAssetSource(asset.source.source())
      if (css !== undefined) {
        cssContentByFileName.set(asset.name, css)
      }
    }
  }

  // In RSC mode, CSS from server components is associated with the 'rsc'
  // client entry chunk (not the main 'index' entry). The manifest builder
  // merges the entry chunk's CSS into __root__, so by appending RSC CSS
  // to the entry chunk, those stylesheets get loaded on all pages.
  // CSS may appear in either `files` or `auxiliaryFiles` depending on
  // rspack's CSS extraction strategy.
  const rscEntrypoint = compilation.entrypoints.get('rsc')

  if (rscEntrypoint && entryChunkFileName) {
    const mainEntryChunk = chunksByFileName.get(entryChunkFileName)
    if (mainEntryChunk) {
      for (const rscChunk of getGroupChunks(rscEntrypoint)) {
        const allFiles = [...getFiles(rscChunk), ...getAuxiliaryFiles(rscChunk)]
        for (const file of allFiles) {
          if (file.endsWith('.css') && !mainEntryChunk.css.includes(file)) {
            mainEntryChunk.css.push(file)
          }
        }
      }
    }
  }

  return {
    entryChunkFileName,
    chunksByFileName,
    cssContentByFileName,
  }
}

/**
 * Registers a processAssets hook to capture the client build stats
 * after compilation. Returns a getter for the captured build.
 */
export function registerClientBuildCapture(
  api: RsbuildPluginAPI,
  getConfig: GetConfigFn,
): {
  getClientBuild: () => NormalizedClientBuild | undefined
} {
  let clientBuild: NormalizedClientBuild | undefined

  api.processAssets(
    {
      stage: 'report',
      environments: [RSBUILD_ENVIRONMENT_NAMES.client],
    },
    (context: ProcessAssetsContext) => {
      clientBuild = normalizeRspackClientBuild(
        context.compilation,
        api.context.action !== 'dev' &&
          getConfig().startConfig.server.build.inlineCss.enabled,
      )
    },
  )

  return {
    getClientBuild: () => clientBuild,
  }
}
