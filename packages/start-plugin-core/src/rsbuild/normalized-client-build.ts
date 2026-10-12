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
  if (!file.endsWith('.js') && !file.endsWith('.mjs')) return false
  return !isHotUpdateAsset(file)
}

/**
 * Get all JS file names from a chunk.
 */
function getChunkJsFiles(chunk: RspackCompilationChunk): Array<string> {
  const jsFiles: Array<string> = []
  for (const file of chunk.files) {
    if (isManifestJsAsset(file)) {
      jsFiles.push(file)
    }
  }
  return jsFiles
}

/**
 * Get unique CSS file names from both primary and auxiliary chunk assets.
 */
function getChunkCssFiles(chunk: RspackCompilationChunk): Array<string> {
  const cssFiles: Array<string> = []
  const seen = new Set<string>()

  for (const file of [...chunk.auxiliaryFiles, ...chunk.files]) {
    if (file.endsWith('.css') && !seen.has(file)) {
      seen.add(file)
      cssFiles.push(file)
    }
  }

  return cssFiles
}

/**
 * Include inner modules so concatenation does not hide route metadata or
 * static dependency edges.
 */
function getModulesIncludingConcatenated(
  modules: Array<RspackModule>,
): Array<RspackModule> {
  const allModules = new Set(modules)
  for (const module of allModules) {
    const concatenatedModules = (
      module as RspackModule & { modules?: Array<RspackModule> }
    ).modules
    if (concatenatedModules) {
      for (const concatenatedModule of concatenatedModules) {
        allModules.add(concatenatedModule)
      }
    }
  }

  return Array.from(allModules)
}

/**
 * Compute dynamicImports for a chunk by traversing its chunk groups'
 * childrenIterable (async/dynamic import edges).
 *
 * In rspack, a chunk belongs to one or more ChunkGroups. Each ChunkGroup
 * has childrenIterable — child ChunkGroups representing dynamic import()
 * points. The JS files from those child groups' chunks are the
 * dynamicImports (analogous to Rollup's OutputChunk.dynamicImports).
 */
function computeDynamicImports(chunk: RspackCompilationChunk): Array<string> {
  const dynamicImportFiles: Array<string> = []
  const seen = new Set<string>()

  for (const group of chunk.groupsIterable) {
    for (const childGroup of group.childrenIterable) {
      for (const childChunk of childGroup.chunks) {
        for (const file of childChunk.files) {
          if (isManifestJsAsset(file) && !seen.has(file)) {
            seen.add(file)
            dynamicImportFiles.push(file)
          }
        }
      }
    }
  }

  return dynamicImportFiles
}

/**
 * Compute the emitted chunks reached by active static module dependencies.
 * Dependencies nested in async blocks are deliberately excluded: those are
 * represented by chunk-group children in `dynamicImports` instead.
 */
function computeStaticDependencyChunks(
  compilation: RspackCompilation,
  chunk: RspackCompilationChunk,
): Array<RspackCompilationChunk> {
  const importedChunks: Array<RspackCompilationChunk> = []
  const seen = new Set<RspackCompilationChunk>([chunk])
  const modules = getModulesIncludingConcatenated(
    compilation.chunkGraph.getChunkModules(chunk),
  )
  const localModules = new Set(modules)
  const runtime = Array.from(chunk.runtime)
  // A shared chunk can belong to several route groups. Group membership
  // limits where dependencies can be loaded from; it does not establish
  // an import from the shared chunk back to every route in those groups.
  const availableChunks = new Set<RspackCompilationChunk>()
  const groups = new Set(chunk.groupsIterable)
  for (const group of groups) {
    for (const availableChunk of group.chunks) {
      availableChunks.add(availableChunk)
    }
    for (const parent of group.getParents()) {
      groups.add(parent)
    }
  }

  for (const module of modules) {
    for (const dependency of module.dependencies) {
      const connection = compilation.moduleGraph.getConnection(dependency)
      const importedModule = connection?.module
      if (!connection || !importedModule || localModules.has(importedModule)) {
        continue
      }
      if (connection.getActiveState(runtime) === false) {
        continue
      }

      for (const importedChunk of compilation.chunkGraph.getModuleChunksIterable(
        importedModule,
      )) {
        if (availableChunks.has(importedChunk) && !seen.has(importedChunk)) {
          seen.add(importedChunk)
          importedChunks.push(importedChunk)
        }
      }
    }
  }

  return importedChunks
}

/**
 * Collect CSS from dependency chunks that have no JavaScript asset of their
 * own, preserving dependency-before-importer order across nested CSS chunks.
 */
function computeCssOnlyDependencyFiles(
  compilation: RspackCompilation,
  chunks: Array<RspackCompilationChunk>,
): Array<string> {
  const cssFiles: Array<string> = []
  const seenChunks = new Set<RspackCompilationChunk>()
  const seenFiles = new Set<string>()

  const visit = (chunk: RspackCompilationChunk) => {
    if (seenChunks.has(chunk) || getChunkJsFiles(chunk).length > 0) {
      return
    }
    seenChunks.add(chunk)

    for (const importedChunk of computeStaticDependencyChunks(
      compilation,
      chunk,
    )) {
      visit(importedChunk)
    }

    for (const cssFile of getChunkCssFiles(chunk)) {
      if (!seenFiles.has(cssFile)) {
        seenFiles.add(cssFile)
        cssFiles.push(cssFile)
      }
    }
  }

  for (const chunk of chunks) {
    visit(chunk)
  }

  return cssFiles
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
  const chunksByFileName = new Map<string, NormalizedClientChunk>()
  let cssContentByFileName: Map<string, string> | undefined
  let entryChunkFileName: string | undefined

  // Collect all initial JS file names from the main entry for computing
  // the entry chunk's `imports` (vendor/shared sibling chunks).
  const entrypoint = compilation.entrypoints.get('index')
  const initialJsFileNames: Array<string> = []
  const entryChunkSet = new Set<RspackCompilationChunk>()
  if (entrypoint) {
    for (const chunk of entrypoint.chunks) {
      entryChunkSet.add(chunk)
      for (const file of chunk.files) {
        if (isManifestJsAsset(file)) {
          initialJsFileNames.push(file)
        }
      }
    }
  }

  // Iterate ALL chunks (initial + async) to capture route-split chunks
  for (const chunk of compilation.chunks) {
    const modules = getModulesIncludingConcatenated(
      compilation.chunkGraph.getChunkModules(chunk),
    )
    const routeFilePaths = getRouteFilePathsFromModules(modules)
    const hydrationIds = getHydrationIdsFromModules(modules)
    const cssFiles = getChunkCssFiles(chunk)

    // The entry chunk is the one named 'index' in the 'index' entrypoint
    const isEntryChunk = chunk.name === 'index' && entryChunkSet.has(chunk)

    const jsFiles = getChunkJsFiles(chunk)
    if (jsFiles.length === 0) continue

    // Compute dynamicImports from chunk group children
    const dynamicImports = computeDynamicImports(chunk)
    const staticDependencyChunks = computeStaticDependencyChunks(
      compilation,
      chunk,
    )
    const dependencyCssFiles = computeCssOnlyDependencyFiles(
      compilation,
      staticDependencyChunks,
    ).filter((cssFile) => !cssFiles.includes(cssFile))
    if (dependencyCssFiles.length > 0) {
      cssFiles.unshift(...dependencyCssFiles)
    }

    for (const file of jsFiles) {
      // For the entry chunk, `imports` contains all sibling initial chunks
      // (vendor/shared). For other chunks, it contains the emitted chunks
      // reached through active static module dependencies.
      const imports = isEntryChunk
        ? initialJsFileNames.filter((f) => f !== file)
        : staticDependencyChunks.flatMap(getChunkJsFiles)

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
      for (const rscChunk of rscEntrypoint.chunks) {
        const allFiles = [...rscChunk.files, ...rscChunk.auxiliaryFiles]
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
