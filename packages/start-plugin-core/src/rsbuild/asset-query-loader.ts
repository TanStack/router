/**
 * The Rspack loader of asset queries (`x.server.ts?raw`, `logo.png?url`): a
 * pitch only, so a file is never read here, and never decoded on its way
 * through (it may be binary). A denied file's mock replaces it; any other is
 * left to its rules. Static, as `compiler-loader.ts`.
 */
import { LOADER_REGISTRY } from './loader-registry'
import type { Rspack } from '@rsbuild/core'
import type { LoaderOptions } from './compiler-session'
import type { LoaderImpl } from './compiler-loader'

export function pitch(
  this: Rspack.LoaderContext<LoaderOptions>,
): Promise<string | undefined> | undefined {
  const impl = (this._compiler as unknown as Record<string, unknown>)[
    LOADER_REGISTRY
  ] as LoaderImpl | undefined
  return impl?.(this, '', undefined, this.getOptions()).then(
    (result) => result.code || undefined,
  )
}
