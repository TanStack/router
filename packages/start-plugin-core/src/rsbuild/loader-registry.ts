/**
 * The property of an environment's compiler holding the implementation of
 * Start's Rspack loader (`compiler-loader.ts`). Its own module so that the
 * host plugin does not load the loader file: Rspack imports that file
 * itself, by path, and tooling that wraps loaders at load time (the
 * compiler-perf floor) sees the first load.
 */
export const LOADER_REGISTRY = '__tanstackStartCompiler'
