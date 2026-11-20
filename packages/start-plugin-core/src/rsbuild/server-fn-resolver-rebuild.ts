import { rebuildModules } from '@tanstack/router-utils/compiler'
import type { Rspack } from '@rsbuild/core'

/** The server environment's server-fn resolver virtual module. */
export interface ServerFnResolverModule {
  /** Its path. */
  path: () => string
  /** Writes the current resolver content to it; the content. */
  update: () => string
}

/**
 * The resolver's part of a server compiler's `finishMake` closure (the
 * host plugin's rounds): the resolver module is built again when its
 * content differs from the one this compiler last built it from. A rebuild
 * builds the provider modules the manifest imports and what they import,
 * which may define server functions the registry did not know yet (a
 * function only another handler calls, with a separate provider: J4.2 "in
 * any module processing order"): the closure's next round finds the new
 * content. Rebuilding an unchanged resolver can make Rspack rebuild the
 * whole chunk graph.
 */
export function serverFnResolverRebuild(resolver: ServerFnResolverModule): {
  /** The resolver's content now (written), when this compiler last built the module from another; null when it has it. */
  pending: () => string | null
  /** Builds the resolver of the compiler's own compilation again, from `content` (`pending`'s). */
  rebuild: (compilation: Rspack.Compilation, content: string) => Promise<void>
  /**
   * Builds it in a child compilation: child compilers copy `finishMake`
   * taps from their parent. Child compilations always rebuild and do not
   * change this compiler's state.
   */
  child: (compilation: Rspack.Compilation) => Promise<void>
} {
  /** The content this compiler last built the resolver from. */
  let builtFrom: string | undefined
  const rebuild = (compilation: Rspack.Compilation) =>
    rebuildModules(compilation, new Set([resolver.path()]), (r) => r)
  return {
    pending() {
      // (read before the rebuild reads the module: a write that lands during
      // it differs from the content built)
      const content = resolver.update()
      return content === builtFrom ? null : content
    },
    async rebuild(compilation, content) {
      await rebuild(compilation)
      builtFrom = content
    },
    async child(compilation) {
      resolver.update()
      await rebuild(compilation)
    },
  }
}
