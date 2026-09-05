import { batch, createAtom } from '@tanstack/store'
import { createMemoryHistory } from '@tanstack/history'
import { isServer } from '@tanstack/router-core/isServer'
import {
  RouterCore,
  BaseRootRoute,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import type { interpolatePath } from '../src/path'
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

export function createTestPathInterpolator() {
  const router = createTestRouter({
    routeTree: new BaseRootRoute({}),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    scrollRestoration: false,
  })
  router.history.destroy()
  const interpolate = router['interpolatePath']

  return (options: Parameters<typeof interpolatePath>[0]): string => {
    router.isServer = options.server ?? false
    router.pathParamsDecoder = options.decoder
    // Support both sides of the factory-to-method benchmark comparison.
    const args =
      interpolate.length === 1
        ? [options]
        : [options.path || '/', options.params]
    const result = Reflect.apply(interpolate, router, args)
    if (typeof result !== 'string') {
      throw new Error('Expected an interpolated pathname')
    }
    return result
  }
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
