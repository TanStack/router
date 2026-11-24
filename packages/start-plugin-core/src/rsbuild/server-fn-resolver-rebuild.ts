import { rebuildModules } from '@tanstack/router-utils/compiler'
import { builtFrom } from './generated-module'
import type { GeneratedTarget } from './generated-module'
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
 * host plugin's rounds): the resolver module of a compilation is built
 * again when it was built from another content than the current one
 * (`generated-module.ts`: the module carries what it was built from, so a
 * module the persistent cache restored, and a child compilation's, are
 * judged as one built now). A rebuild builds the provider modules the
 * manifest imports and what they import, which may define server functions
 * the registry did not know yet (a function only another handler calls,
 * with a separate provider: J4.2 "in any module processing order"): the
 * closure's next round finds the new content. Rebuilding an unchanged
 * resolver can make Rspack rebuild the whole chunk graph.
 */
export function serverFnResolverRebuild(
  resolver: ServerFnResolverModule,
  /** The compiler's generated module at a file (`StartRsbuildCompilerSession.generatedTarget`). */
  target: (file: string) => GeneratedTarget,
): {
  /** The resolver's content now (written), when `compilation`'s module was built from another; null when it has it. */
  pending: (compilation: Rspack.Compilation) => string | null
  /** Builds the resolver of `compilation` again, from `content` (`pending`'s). */
  rebuild: (compilation: Rspack.Compilation, content: string) => Promise<void>
} {
  /**
   * The content each compilation last built its resolver from here: a
   * module whose bytes another loader read before Start's carries no
   * digest of them, and is not built twice from one content.
   */
  const built = new WeakMap<Rspack.Compilation, string>()
  return {
    pending(compilation) {
      // (read before the rebuild reads the module: a write that lands during
      // it differs from the content built)
      const content = resolver.update()
      return built.get(compilation) === content ||
        builtFrom(compilation, target(resolver.path()), content)
        ? null
        : content
    },
    async rebuild(compilation, content) {
      await rebuildModules(
        compilation,
        new Set([resolver.path()]),
        (r: string) => r,
      )
      built.set(compilation, content)
    },
  }
}
