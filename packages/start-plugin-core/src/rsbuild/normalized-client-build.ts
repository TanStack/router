import { tssHydrate } from '../hydration-constants'
import { getCssAssetSource } from '../start-manifest-plugin/inlineCss'
import { isRouteSplitQuery } from '../start-manifest-plugin/routeChunks'
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
 * A route's chunks hold one of its split groups (`isRouteSplitQuery`).
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

    if (!isRouteSplitQuery(resourcePart.slice(queryIndex + 1))) {
      continue
    }

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
 * Compute dynamicImports for a chunk (analogous to Rollup's
 * `OutputChunk.dynamicImports`): the JS files of the chunk groups that the
 * async blocks (`import()` points) of the chunk's own modules load.
 *
 * Not the children of the chunk's groups: a shared chunk is in the group of
 * every route that uses it, and those groups' children are every route's
 * `import()` targets, not the shared chunk's.
 */
function computeDynamicImports(
  compilation: RspackCompilation,
  modules: Array<RspackModule>,
): Array<string> {
  const dynamicImportFiles: Array<string> = []
  const seen = new Set<string>()

  for (const module of modules) {
    const blocks = [...module.blocks]
    for (const block of blocks) {
      blocks.push(...block.blocks)
      const group = compilation.chunkGraph.getBlockChunkGroup(block)
      if (!group) {
        continue
      }
      for (const childChunk of group.chunks) {
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
 * the chunk's `dynamicImports` instead.
 */
function computeStaticDependencyChunks(
  compilation: RspackCompilation,
  chunk: RspackCompilationChunk,
  graph: CompilationGraph,
): Array<RspackCompilationChunk> {
  // A shared chunk can belong to several route groups. Group membership
  // limits where dependencies can be loaded from; it does not establish
  // an import from the shared chunk back to every route in those groups.
  // A chunk counts as available only when every group of this chunk (or
  // one of its ancestors) has it: a module duplicated into each route's
  // chunk is satisfied per group, by that group's own chunk, so neither
  // route's chunk is a dependency of the shared chunk (#8780).
  let availableChunks: Set<RspackCompilationChunk> | undefined
  for (const group of chunk.groupsIterable) {
    const groupChunks = new Set<RspackCompilationChunk>()
    const ancestors = new Set([group])
    for (const ancestor of ancestors) {
      for (const availableChunk of ancestor.chunks) {
        groupChunks.add(availableChunk)
      }
      for (const parent of ancestor.getParents()) {
        ancestors.add(parent)
      }
    }
    if (availableChunks === undefined) {
      availableChunks = groupChunks
    } else {
      for (const availableChunk of availableChunks) {
        if (!groupChunks.has(availableChunk)) {
          availableChunks.delete(availableChunk)
        }
      }
    }
  }
  availableChunks ??= new Set()

  const importedChunks: Array<RspackCompilationChunk> = []
  // Only the available chunks other than this one can be found: once all of
  // them are, the module walk has nothing left to add. An entry chunk alone
  // in its group never walks.
  let unfound = availableChunks.size - (availableChunks.has(chunk) ? 1 : 0)
  if (unfound === 0) {
    return importedChunks
  }

  const seen = new Set<RspackCompilationChunk>([chunk])
  const modules = getModulesIncludingConcatenated(
    compilation.chunkGraph.getChunkModules(chunk),
  )
  const localModules = new Set(modules)
  const runtime = Array.from(chunk.runtime)
  // Every connection to a module adds the same chunks, so a module counts
  // once, from its first active connection (an inactive one adds nothing and
  // leaves the module to a later active one).
  const counted = new Set<RspackModule>()
  for (const module of modules) {
    for (const dependency of graph.dependenciesOf(module)) {
      const imported = graph.importOf(dependency)
      if (
        !imported ||
        localModules.has(imported.module) ||
        counted.has(imported.module)
      ) {
        continue
      }
      if (imported.connection.getActiveState(runtime) === false) {
        continue
      }
      counted.add(imported.module)

      for (const importedChunk of graph.chunksOf(imported.module)) {
        if (availableChunks.has(importedChunk) && !seen.has(importedChunk)) {
          seen.add(importedChunk)
          importedChunks.push(importedChunk)
          if (--unfound === 0) {
            return importedChunks
          }
        }
      }
    }
  }

  return importedChunks
}

type GetStaticDependencyChunks = (
  chunk: RspackCompilationChunk,
) => Array<RspackCompilationChunk>

/**
 * What the static dependency resolution reads from Rspack's graphs, read once
 * per module or dependency, and only when the walk gets to it: a module is in
 * several chunks and imported from many, and most walks stop early.
 */
interface CompilationGraph {
  /** The module's static dependencies, in order. */
  dependenciesOf: (module: RspackModule) => Array<Rspack.Dependency>
  /** The module a dependency resolved to, if any. */
  importOf: (dependency: Rspack.Dependency) => {
    module: RspackModule
    connection: Rspack.ModuleGraphConnection
  } | null
  chunksOf: (module: RspackModule) => Array<RspackCompilationChunk>
}

function memoize<TKey, TValue>(
  read: (key: TKey) => TValue,
): (key: TKey) => TValue {
  const values = new Map<TKey, TValue>()
  return (key) => {
    let value = values.get(key)
    if (value === undefined) {
      value = read(key)
      values.set(key, value)
    }
    return value
  }
}

/**
 * Memoize static dependency resolution per chunk. Every chunk is resolved once
 * for its own `imports`, and CSS-only chunks are resolved again from each
 * importer that reaches them. The memos live as long as the resolver, which is
 * created per normalized compilation.
 */
function createStaticDependencyChunkResolver(
  compilation: RspackCompilation,
): GetStaticDependencyChunks {
  const graph: CompilationGraph = {
    dependenciesOf: memoize((module) => module.dependencies),
    importOf: memoize((dependency) => {
      const connection = compilation.moduleGraph.getConnection(dependency)
      const module = connection?.module
      return connection && module ? { module, connection } : null
    }),
    chunksOf: memoize((module) =>
      Array.from(compilation.chunkGraph.getModuleChunksIterable(module)),
    ),
  }

  return memoize((chunk) =>
    computeStaticDependencyChunks(compilation, chunk, graph),
  )
}

/**
 * Collect CSS from dependency chunks that have no JavaScript asset of their
 * own, preserving dependency-before-importer order across nested CSS chunks.
 */
function computeCssOnlyDependencyFiles(
  getStaticDependencyChunks: GetStaticDependencyChunks,
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

    for (const importedChunk of getStaticDependencyChunks(chunk)) {
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

  const getStaticDependencyChunks =
    createStaticDependencyChunkResolver(compilation)

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

    const dynamicImports = computeDynamicImports(compilation, modules)
    const staticDependencyChunks = getStaticDependencyChunks(chunk)
    const dependencyCssFiles = computeCssOnlyDependencyFiles(
      getStaticDependencyChunks,
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
