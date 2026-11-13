/**
 * The Rspack loader of Start's compiler. A static file so
 * that Rspack loads it by path (and the persistent cache keys it); the
 * implementation lives on the environment's compiler, installed by the
 * host plugin (`host-plugin.ts`), so this file imports nothing stateful of
 * the package (one module instance of the session, whichever `dist` entry
 * Rspack loads this from), and nothing of the package imports this file.
 * Raw: its rule matches every JavaScript file, and a module the compiler
 * does not compile goes on as the bytes it came as.
 */
import { loaderImplOf } from './loader-registry'
import type { Rspack } from '@rsbuild/core'
import type { LoaderOptions } from './compiler-session'

/** `source`: the module's bytes (the loader is raw). */
export type LoaderImpl = (
  ctx: Rspack.LoaderContext<LoaderOptions>,
  source: Buffer,
  inputMap: unknown,
  options: LoaderOptions,
) => Promise<{ code: string | Buffer; map: unknown }>

// (Rspack types loaders that are not raw only)
const tanstackStartCompilerLoader = function (
  this: Rspack.LoaderContext<LoaderOptions>,
  source: Buffer,
  inputMap?: string | Rspack.sources.RawSourceMap,
) {
  const callback = this.async()
  const impl = loaderImplOf(this._compiler)
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

export const raw = true
