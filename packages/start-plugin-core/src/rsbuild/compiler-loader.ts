/**
 * The Rspack loader of Start's compiler. A static file so
 * that Rspack loads it by path (and the persistent cache keys it); the
 * implementation lives on the environment's compiler, installed by the
 * host plugin (`host-plugin.ts`), so this file imports nothing stateful of
 * the package (one module instance of the session, whichever `dist` entry
 * Rspack loads this from), and nothing of the package imports this file.
 */
import { LOADER_REGISTRY } from './loader-registry'
import type { Rspack } from '@rsbuild/core'
import type { LoaderOptions } from './compiler-session'

export type LoaderImpl = (
  ctx: Rspack.LoaderContext<LoaderOptions>,
  source: string,
  inputMap: unknown,
  options: LoaderOptions,
) => Promise<{ code: string; map: unknown }>

const tanstackStartCompilerLoader: Rspack.LoaderDefinition<LoaderOptions> =
  function (source, inputMap) {
    const callback = this.async()
    const impl = (this._compiler as unknown as Record<string, unknown>)[
      LOADER_REGISTRY
    ] as LoaderImpl | undefined
    if (!impl) {
      callback(null, source, inputMap)
      return
    }
    impl(this, source, inputMap, this.getOptions()).then(
      (result) => callback(null, result.code, result.map as never),
      (error: Error) => callback(error),
    )
  }

export default tanstackStartCompilerLoader
