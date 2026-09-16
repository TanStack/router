import type { Rspack } from '@rsbuild/core'

const codecModule =
  /[\\/]start-client-core[\\/](?:src|dist[\\/]esm)[\\/]client-rpc[\\/]serverFnCodec\.[jt]s$/

function createServerFnCodecVendorGroup(): Rspack.OptimizationSplitChunksCacheGroup {
  const graphs = new WeakMap<
    Rspack.Compilation['chunkGraph'],
    WeakMap<Rspack.Chunk, boolean>
  >()
  return {
    // Preserve the default vendor group, except dependencies used only by
    // the codec: extracting those adds a request and prevents concatenation.
    test(module, { chunkGraph }) {
      if (!/[\\/]node_modules[\\/]/.test(module.nameForCondition() ?? '')) {
        return false
      }
      let onlyChunk: Rspack.Chunk | undefined
      for (const chunk of chunkGraph.getModuleChunksIterable(module)) {
        if (onlyChunk || chunk.canBeInitial()) {
          return true
        }
        onlyChunk = chunk
      }
      if (!onlyChunk) {
        return true
      }
      let codecChunks = graphs.get(chunkGraph)
      if (!codecChunks) {
        codecChunks = new WeakMap()
        graphs.set(chunkGraph, codecChunks)
      }
      let isCodec = codecChunks.get(onlyChunk)
      if (isCodec === undefined) {
        isCodec = false
        for (const member of chunkGraph.getChunkModulesIterable(onlyChunk)) {
          if (codecModule.test(member.nameForCondition() ?? '')) {
            isCodec = true
            break
          }
        }
        codecChunks.set(onlyChunk, isCodec)
      }
      return !isCodec
    },
    idHint: 'vendors',
    priority: -10,
    reuseExistingChunk: true,
  }
}

/** Apply after preset resolution; user tools.rspack callbacks still run later. */
export function applyServerFnCodecSplitting(
  config: Rspack.Configuration,
): void {
  const splitChunks = config.optimization?.splitChunks
  if (
    !splitChunks ||
    (splitChunks.cacheGroups &&
      Object.prototype.hasOwnProperty.call(
        splitChunks.cacheGroups,
        'defaultVendors',
      ))
  ) {
    return
  }
  splitChunks.cacheGroups = {
    ...splitChunks.cacheGroups,
    defaultVendors: createServerFnCodecVendorGroup(),
  }
}
