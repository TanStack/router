import type { Rspack } from '@rsbuild/core'

export interface ServerFnResolverRebuildOptions {
  /** Name of the finishMake tap. */
  name: string
  /** Writes the current resolver content to its virtual module. */
  updateResolver: () => void
  /** Returns how many times this environment's resolver has been written. */
  getResolverWriteCount: () => number
  /** Rebuilds the resolver module in the given compilation. */
  rebuildResolver: (compilation: Rspack.Compilation) => Promise<void>
}

/** Rebuilds of the resolver within one `finishMake` (each may register the functions of modules it reaches). */
const MAX_REBUILDS = 8

/**
 * Rebuilds the server function resolver module at finishMake stage -10,
 * after stage -20 has refreshed the server function registry, until its
 * content settles: a rebuild builds the provider modules the manifest
 * imports and what they import, which may define server functions the
 * registry did not know yet (a function only another handler calls, with a
 * separate provider: J4.2 "in any module processing order"), so the
 * resolver is regenerated and rebuilt again while its content changes
 * (bounded).
 *
 * Skips the rebuild when the resolver content has not changed since this
 * compiler last rebuilt it. Rebuilding an unchanged resolver can make Rspack
 * rebuild the whole chunk graph.
 */
export function tapServerFnResolverRebuild(
  compiler: Rspack.Compiler,
  options: ServerFnResolverRebuildOptions,
): void {
  // Write count of the resolver content this compiler last rebuilt from.
  let rebuiltAtWriteCount: number | undefined

  compiler.hooks.finishMake.tapPromise(
    { name: options.name, stage: -10 },
    async (compilation) => {
      options.updateResolver()

      // Child compilers copy finishMake taps from their parent. Child
      // compilations always rebuild and do not change this compiler's state.
      if (compilation.compiler !== compiler) {
        await options.rebuildResolver(compilation)
        return
      }

      for (let round = 0; round < MAX_REBUILDS; round++) {
        // Read the count before the rebuild reads the resolver, so a write
        // that lands during the rebuild causes another rebuild.
        const writeCount = options.getResolverWriteCount()
        if (writeCount === rebuiltAtWriteCount) {
          return
        }
        await options.rebuildResolver(compilation)
        rebuiltAtWriteCount = writeCount
        options.updateResolver()
      }
    },
  )
}
