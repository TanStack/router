/**
 * Start's real runtime, for the modules the harness evaluates: the
 * `@tanstack/start-client-core` package (`createServerFn`,
 * `createMiddleware`, `createStart`, the env-only and isomorphic factories,
 * everything `@tanstack/<framework>-start` re-exports from it) and
 * `createServerRpc` of `@tanstack/start-server-core`.
 *
 * Start runs server fns inside a request context (`runWithStartContext` of
 * `@tanstack/start-storage-context`, which its request handler opens). The
 * harness calls them outside any request, so the storage falls back to a
 * context of an empty request: no request middleware ran, no global
 * middleware, default start options.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { realpathSync } from 'node:fs'
import { resolveModulePath } from 'exsolve'

// The key `@tanstack/start-storage-context` shares its storage under.
const storageKey = Symbol.for('tanstack-start:start-storage-context')

type Storage = AsyncLocalStorage<unknown> & { tanstackStartTestFallback?: true }
const global = globalThis as unknown as Record<symbol, Storage | undefined>
const storage: Storage = (global[storageKey] ??= new AsyncLocalStorage())
if (!storage.tanstackStartTestFallback) {
  const getStore = storage.getStore.bind(storage)
  storage.getStore = () =>
    getStore() ?? {
      request: new Request('http://localhost/_serverFn/test'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
      getRouter: () => {
        throw new Error('no router in the test request context')
      },
    }
  storage.tanstackStartTestFallback = true
}

// `@tanstack/start-client-core` is a dependency of
// `@tanstack/start-server-core`, resolved from there.
const startClientCoreEntry = realpathSync(
  resolveModulePath('@tanstack/start-client-core', {
    from: resolveModulePath('@tanstack/start-server-core/package.json', {
      from: import.meta.url,
    }),
    conditions: ['import', 'node'],
  }),
)

/** The exports of `@tanstack/start-client-core`. */
export const startClientCore: Record<string, any> = {
  ...((await import(/* @vite-ignore */ startClientCoreEntry)) as Record<
    string,
    unknown
  >),
}

/**
 * `createSsrRpc` of `@tanstack/start-server-core`: its RPCs carry the right
 * metadata, but calling one asks the server-fn resolver of the app's build,
 * which a test has none of (the harness links its own, `createServerGraph`).
 */
export const createSsrRpc: (functionId: string) => object = (
  await import('@tanstack/start-server-core/createSsrRpc')
).createSsrRpc

/** `createServerRpc` of `@tanstack/start-server-core`. */
export const createServerRpc: (
  serverFnMeta: { id: string; name: string; filename: string },
  splitImportFn: (...args: Array<any>) => any,
) => object = (await import('@tanstack/start-server-core/createServerRpc'))
  .createServerRpc

/** `createClientRpc` of `@tanstack/start-client-core/client-rpc`. */
export const { createClientRpc } = (await import(
  /* @vite-ignore */ startClientCoreEntry.replace(
    /index\.js$/,
    'client-rpc/index.js',
  )
)) as { createClientRpc: (functionId: string) => object }
