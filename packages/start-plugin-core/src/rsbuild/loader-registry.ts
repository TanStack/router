import type { LoaderImpl } from './compiler-loader'

/**
 * The property of an environment's compiler holding the implementation of
 * Start's Rspack loader (`compiler-loader.ts`). Its own module so that the
 * host plugin does not load the loader file: Rspack imports that file
 * itself, by path, and tooling that wraps loaders at load time (the
 * compiler-perf floor) sees the first load.
 */
export const LOADER_REGISTRY = '__tanstackStartCompiler'

/**
 * The loader implementation of the environment a loader runs in: the one
 * on the environment's compiler, also from a child compiler of it (a
 * worker's or a service worker's: it takes the environment's module rules,
 * so Start's loaders, but none of its plugins), whose `root` is the
 * environment's compiler.
 */
export function loaderImplOf(compiler: {
  root?: unknown
}): LoaderImpl | undefined {
  return ((compiler.root ?? compiler) as Record<string, unknown>)[
    LOADER_REGISTRY
  ] as LoaderImpl | undefined
}
