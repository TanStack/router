import { tsrSplit } from '@tanstack/router-plugin'
import { tssHydrate } from '../hydration-constants'
import { getCssAssetSource } from '../start-manifest-plugin/inlineCss'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type {
  GetConfigFn,
  NormalizedClientAssets,
  NormalizedClientGroupBuild,
} from '../types'

type ProcessAssetsContext = Parameters<
  Parameters<RsbuildPluginAPI['processAssets']>[1]
>[0]
type ChunkGroup = Rspack.ChunkGroup

function isManifestJsAsset(file: string): boolean {
  return (
    (file.endsWith('.js') || file.endsWith('.mjs')) &&
    !file.includes('.hot-update.')
  )
}

function getRequestQuery(request: string): URLSearchParams {
  const resource = request.slice(request.lastIndexOf('!') + 1)
  const queryIndex = resource.indexOf('?')
  return new URLSearchParams(
    queryIndex < 0 ? '' : resource.slice(queryIndex + 1).split('#')[0],
  )
}

/** Resolve tagged imports once per importer, including aliases and relative paths. */
function getTaggedImportPaths(
  compilation: Rspack.Compilation,
  module: Rspack.Module,
): Map<string, string> {
  const paths = new Map<string, string>()
  const blocks = [...module.blocks]
  for (const block of blocks) {
    blocks.push(...block.blocks)
    for (const dependency of block.dependencies) {
      const request = dependency.request
      if (!request || !getRequestQuery(request).has(tsrSplit)) {
        continue
      }
      const target = compilation.moduleGraph.getModule(dependency)
      const filePath = target?.nameForCondition()
      if (filePath) {
        paths.set(request, filePath.replace(/\\/g, '/'))
      }
    }
  }
  return paths
}

/** A parent contributes only chunks present on every path into the group. */
function getAvailableChunks(groups: ReadonlyArray<ChunkGroup>) {
  const available = new Map<ChunkGroup, Set<Rspack.Chunk>>()
  const records = groups.map((group) => ({
    group,
    chunks: group.chunks,
    parents: group.isInitial() ? [] : group.getParents(),
  }))
  let changed = true
  while (changed) {
    changed = false
    for (const { group, chunks, parents } of records) {
      let inherited: Set<Rspack.Chunk> | undefined
      for (const parent of parents) {
        const parentChunks = available.get(parent)
        if (!parentChunks) {
          continue
        }
        inherited = inherited
          ? new Set([...inherited].filter((chunk) => parentChunks.has(chunk)))
          : new Set(parentChunks)
      }
      if (parents.length > 0 && !inherited) {
        continue
      }
      const next = inherited ?? new Set<Rspack.Chunk>()
      for (const chunk of chunks) {
        next.add(chunk)
      }
      // Starting at the entry groups, known sets shrink as parent paths
      // resolve. Revisit until cyclic async graphs converge in either order.
      if (available.get(group)?.size !== next.size) {
        available.set(group, next)
        changed = true
      }
    }
  }
  return available
}

function appendAssets(
  target: NormalizedClientAssets,
  source: NormalizedClientAssets,
) {
  for (const key of ['preloads', 'css'] as const) {
    const seen = new Set(target[key])
    for (const file of source[key]) {
      if (!seen.has(file)) {
        target[key].push(file)
        seen.add(file)
      }
    }
  }
}

/** Capture route loading contexts without manufacturing chunk import edges. */
export function normalizeRspackClientBuild(
  compilation: Rspack.Compilation,
  inlineCssEnabled = false,
): NormalizedClientGroupBuild {
  const entrypoint = compilation.entrypoints.get('index')
  const entryChunk = entrypoint?.getEntrypointChunk()
  const entryChunkFileName =
    entryChunk && [...entryChunk.files].find(isManifestJsAsset)
  if (!entrypoint || !entryChunkFileName) {
    throw new Error('No entry file found in rspack client build')
  }

  const importsByModule = new Map<Rspack.Module, Map<string, string>>()
  const groupsByRoute = new Map<string, Set<ChunkGroup>>()
  const hydrationGroups = new Set<ChunkGroup>()
  for (const group of compilation.chunkGroups) {
    for (const origin of group.origins) {
      if (!origin.request) {
        continue
      }
      const query = getRequestQuery(origin.request)
      if (query.get(tssHydrate)) {
        hydrationGroups.add(group)
      }
      if (!query.has(tsrSplit) || !origin.module) {
        continue
      }
      let imports = importsByModule.get(origin.module)
      if (!imports) {
        imports = getTaggedImportPaths(compilation, origin.module)
        importsByModule.set(origin.module, imports)
      }
      const filePath = imports.get(origin.request)
      if (!filePath) {
        continue
      }
      let groups = groupsByRoute.get(filePath)
      if (!groups) {
        groups = new Set()
        groupsByRoute.set(filePath, groups)
      }
      groups.add(group)
    }
  }

  const available = getAvailableChunks(compilation.chunkGroups)
  const filesByChunk = new Map<Rspack.Chunk, NormalizedClientAssets>()
  const cssModulesByChunk = new Map<Rspack.Chunk, Array<Rspack.Module>>()
  const readChunk = (chunk: Rspack.Chunk) => {
    let assets = filesByChunk.get(chunk)
    if (!assets) {
      assets = { preloads: [], css: [] }
      const files = new Set([...chunk.files, ...chunk.auxiliaryFiles])
      for (const file of files) {
        if (file.endsWith('.css') && !file.includes('.hot-update.')) {
          assets.css.push(file)
        }
      }
      for (const file of chunk.files) {
        if (isManifestJsAsset(file)) {
          assets.preloads.push(file)
        }
      }
      filesByChunk.set(chunk, assets)
    }
    return assets
  }
  const initialChunks = new Set(entrypoint.chunks)
  const readGroup = (group: ChunkGroup): NormalizedClientAssets => {
    const ownChunks = group.chunks
    // Initial resources are merged into the root separately. Keep shared
    // chunks that also belong to this group, but do not prepend entry CSS.
    const chunks = [...(available.get(group) ?? ownChunks)].filter(
      (chunk) => !initialChunks.has(chunk) || ownChunks.includes(chunk),
    )
    const preloads = new Set<string>()
    // Initial chunks must retain their execution order for IIFE scripts.
    // Async groups put the route chunk last, so list it first for preloading.
    const preloadChunks = group.isInitial()
      ? ownChunks
      : [...ownChunks].reverse()
    for (const chunk of preloadChunks.concat(chunks)) {
      for (const file of readChunk(chunk).preloads) {
        preloads.add(file)
      }
    }
    const cssChunks = chunks.filter((chunk) => readChunk(chunk).css.length > 0)
    const ordered = cssChunks
      .map((chunk) => {
        let modules = cssModulesByChunk.get(chunk)
        if (!modules) {
          modules = [
            ...compilation.chunkGraph.getChunkModulesIterableBySourceType(
              chunk,
              'css',
            ),
            ...compilation.chunkGraph.getChunkModulesIterableBySourceType(
              chunk,
              'css/mini-extract',
            ),
          ]
          cssModulesByChunk.set(chunk, modules)
        }
        const indices = modules.flatMap((module) => {
          const index = group.getModulePostOrderIndex(module)
          return index == null ? [] : [index]
        })
        return { chunk, index: indices.length > 0 ? Math.min(...indices) : -1 }
      })
      .sort((a, b) => a.index - b.index)
    return {
      preloads: [...preloads],
      css: [...new Set(ordered.flatMap(({ chunk }) => readChunk(chunk).css))],
    }
  }

  const addHydrationCss = (
    group: ChunkGroup,
    target: NormalizedClientAssets,
    visited: Set<ChunkGroup>,
  ) => {
    if (visited.has(group)) {
      return
    }
    visited.add(group)
    for (const child of group.childrenIterable) {
      if (hydrationGroups.has(child)) {
        appendAssets(target, { preloads: [], css: readGroup(child).css })
        addHydrationCss(child, target, visited)
      }
    }
  }

  const routeAssetsByFilePath = new Map<string, NormalizedClientAssets>()
  for (const [filePath, groups] of groupsByRoute) {
    const assets: NormalizedClientAssets = { preloads: [], css: [] }
    const visited = new Set<ChunkGroup>()
    for (const group of groups) {
      appendAssets(assets, readGroup(group))
      addHydrationCss(group, assets, visited)
    }
    routeAssetsByFilePath.set(filePath, assets)
  }

  const entryAssets = readGroup(entrypoint)
  addHydrationCss(entrypoint, entryAssets, new Set())
  // RSC server-component styles belong to a separate client entry, but must
  // still be present in the root route's server-rendered document.
  const rscEntrypoint = compilation.entrypoints.get('rsc')
  if (rscEntrypoint) {
    appendAssets(entryAssets, {
      preloads: [],
      css: readGroup(rscEntrypoint).css,
    })
  }

  let cssContentByFileName: Map<string, string> | undefined
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
  return {
    entryChunkFileName,
    entryAssets,
    routeAssetsByFilePath,
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
  getClientBuild: () => NormalizedClientGroupBuild | undefined
} {
  let clientBuild: NormalizedClientGroupBuild | undefined

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
