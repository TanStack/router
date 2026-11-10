/**
 * The Rspack loader of asset queries (`x.server.ts?raw`, `logo.png?url`): a
 * pitch only, so a file is never read here, and never decoded on its way
 * through (it may be binary). A denied file's mock replaces it; any other is
 * left to its rules. Static, as `compiler-loader.ts`.
 */
import { loaderImplOf } from './loader-registry'
import type { Rspack } from '@rsbuild/core'
import type { LoaderOptions } from './compiler-session'

export function pitch(
  this: Rspack.LoaderContext<LoaderOptions>,
): Promise<string | undefined> | undefined {
  return loaderImplOf(this._compiler)?.(
    this,
    '',
    undefined,
    this.getOptions(),
  ).then((result) => result.code || undefined)
}
