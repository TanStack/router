import { batch, createAtom } from '@tanstack/store'
import { isServer } from '@tanstack/router-core/isServer'
import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRouter,
  AnyRoute,
  GetStoreConfig,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '../src'

const getStoreConfig: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
  }
}

export function createTestRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) {
  return new RouterCore(options, getStoreConfig)
}

/** Materialize the request-local server result as the HTTP response users see. */
export function loadServerResponse(
  router: AnyRouter,
  path: string,
  signal?: AbortSignal,
) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`, { signal }),
  })(({ router: loadedRouter, responseHeaders }) => {
    const result = loadedRouter._serverResult
    return new Response(null, {
      status:
        result?.type === 'redirect'
          ? result.redirect.status
          : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}
