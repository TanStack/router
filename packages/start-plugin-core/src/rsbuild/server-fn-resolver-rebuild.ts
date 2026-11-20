import { rebuildModules } from '@tanstack/router-utils/compiler'
import type { Rspack } from '@rsbuild/core'

/** The server environment's server-fn resolver virtual module. */
export interface ServerFnResolverModule {
  /** Its path. */
  path: () => string
  /** Writes the current resolver content to it. */
  update: () => void
  /** How many times it has been written. */
  writeCount: () => number
}

/** Rebuilds of the resolver within one closure step (each may register the functions of modules it reaches). */
const MAX_REBUILDS = 8

/**
 * The resolver step of a server compiler's `finishMake` closure (the host
 * plugin's, after the registry's refresh from the compilation's modules):
 * rebuilds the server function resolver module until its content settles.
 * A rebuild builds the provider modules the manifest imports and what they
 * import, which may define server functions the registry did not know yet
 * (a function only another handler calls, with a separate provider: J4.2
 * "in any module processing order"), so the resolver is regenerated and
 * rebuilt again while its content changes (bounded).
 *
 * Skips the rebuild when the resolver content has not changed since this
 * compiler last rebuilt it. Rebuilding an unchanged resolver can make Rspack
 * rebuild the whole chunk graph.
 */
export function serverFnResolverRebuild(resolver: ServerFnResolverModule): {
  /** Rebuilds the resolver of the compiler's own compilation until its content settles; whether it rebuilt it. */
  close: (compilation: Rspack.Compilation) => Promise<boolean>
  /**
   * Rebuilds it in a child compilation: child compilers copy `finishMake`
   * taps from their parent. Child compilations always rebuild and do not
   * change this compiler's state.
   */
  child: (compilation: Rspack.Compilation) => Promise<void>
} {
  // Write count of the resolver content this compiler last rebuilt from.
  let rebuiltAtWriteCount: number | undefined
  const rebuild = (compilation: Rspack.Compilation) =>
    rebuildModules(compilation, new Set([resolver.path()]), (r) => r)
  return {
    async close(compilation) {
      resolver.update()
      let rebuilt = false
      for (let round = 0; round < MAX_REBUILDS; round++) {
        // Read the count before the rebuild reads the resolver, so a write
        // that lands during the rebuild causes another rebuild.
        const writeCount = resolver.writeCount()
        if (writeCount === rebuiltAtWriteCount) {
          break
        }
        await rebuild(compilation)
        rebuilt = true
        rebuiltAtWriteCount = writeCount
        resolver.update()
      }
      return rebuilt
    },
    async child(compilation) {
      resolver.update()
      await rebuild(compilation)
    },
  }
}
