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

/**
 * Rebuilds the server function resolver module at finishMake stage -10,
 * after stage -20 has refreshed the server function registry.
 *
 * Skips the rebuild when the resolver has not been written since this
 * compiler last rebuilt it. In development the resolver is written only when
 * its content changes. Rebuilding an unchanged resolver can make Rspack
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

      // Read the count before the rebuild reads the resolver, so a write
      // that lands during the rebuild causes another rebuild next time.
      const writeCount = options.getResolverWriteCount()
      if (writeCount === rebuiltAtWriteCount) {
        return
      }

      await options.rebuildResolver(compilation)
      rebuiltAtWriteCount = writeCount
    },
  )
}
