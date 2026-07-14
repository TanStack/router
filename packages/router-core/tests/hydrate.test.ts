import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createSerializationAdapter,
  isNotFound,
  notFound,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch, AnyRouter, LocationRewrite } from '../src'
import type { ServerManifest } from '../src/manifest'
import type { TsrSsrGlobal } from '../src/ssr/types'

const testManifest: ServerManifest = {
  routes: {},
}

function createMockBootstrap(
  router?: NonNullable<TsrSsrGlobal['router']>,
): TsrSsrGlobal {
  return {
    router,
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }
}

async function dehydrateToBootstrap(
  router: AnyRouter,
  manifest: ServerManifest = testManifest,
): Promise<TsrSsrGlobal> {
  attachRouterServerSsrUtils({ router, manifest })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()

    const context: Record<string, any> = {
      document: {
        currentScript: {
          remove() {},
        },
      },
    }
    context.self = context
    runInNewContext(script!.children!, context)

    expect(context.$_TSR).toBeDefined()
    return context.$_TSR
  } finally {
    router.serverSsr?.cleanup()
  }
}

describe('hydrate', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }
  let mockRouter: any
  let mockHead: any

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)

    mockHead = vi.fn()

    const history = createMemoryHistory({ initialEntries: ['/'] })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => 'Index',
      notFoundComponent: () => 'Not Found',
      head: mockHead,
    })

    mockRouter = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history,
      isServer: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    [
      'window.$_TSR',
      () => {},
      'Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
    ],
    [
      'window.$_TSR.router',
      () => {
        mockWindow.$_TSR = createMockBootstrap()
      },
      'Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
    ],
  ])(
    'throws a diagnostic when %s is unavailable',
    async (_, setup, message) => {
      setup()

      await expect(hydrate(mockRouter)).rejects.toThrow(message)
    },
  )

  it('round-trips the manifest and encoded matches without running client loaders', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverProductRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/products/$productId',
      loader: ({ params }) => ({
        productId: params.productId,
        source: 'server',
      }),
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverProductRoute]),
      history: createMemoryHistory({ initialEntries: ['/products/42'] }),
      isServer: true,
    })
    const manifest: ServerManifest = {
      routes: {
        [serverRootRoute.id]: { preloads: ['/assets/root.js'] },
        [serverProductRoute.id]: { preloads: ['/assets/product.js'] },
      },
    }

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter, manifest)

    const serverMatches = serverRouter.state.matches
    expect(mockWindow.$_TSR.router?.matches.map((match) => match.i)).toEqual(
      serverMatches.map((match) => dehydrateSsrMatchId(match.id)),
    )

    const clientLoader = vi.fn(() => ({
      productId: 'client',
      source: 'client',
    }))
    const clientRootRoute = new BaseRootRoute({})
    const clientProductRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/products/$productId',
      loader: clientLoader,
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientProductRoute]),
      history: createMemoryHistory({ initialEntries: ['/products/42'] }),
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(clientRouter.ssr?.manifest).toEqual(manifest)
    expect(
      clientRouter.state.matches.map((match) => ({
        id: match.id,
        routeId: match.routeId,
        status: match.status,
        loaderData: match.loaderData,
        ssr: match.ssr,
      })),
    ).toEqual(
      serverMatches.map((match) => ({
        id: match.id,
        routeId: match.routeId,
        status: match.status,
        loaderData: match.loaderData,
        ssr: match.ssr,
      })),
    )
    expect(clientRouter.state.matches.at(-1)?.loaderData).toEqual({
      productId: '42',
      source: 'server',
    })
    expect(clientLoader).not.toHaveBeenCalled()
  })

  it('round-trips adapted loader data through the bootstrap protocol', async () => {
    class AdaptedValue {
      constructor(readonly value: string) {}
    }

    const adapter = createSerializationAdapter({
      key: 'adapted-value',
      test: (value: unknown): value is AdaptedValue =>
        value instanceof AdaptedValue,
      toSerializable: (value: AdaptedValue) => value.value,
      fromSerializable: (value: string) => new AdaptedValue(value),
    })

    const serverRootRoute = new BaseRootRoute({})
    const serverIndexRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/',
      loader: () => new AdaptedValue('server loader data'),
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverIndexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    serverRouter.options.serializationAdapters = [adapter]

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)

    const clientLoader = vi.fn(() => new AdaptedValue('client loader data'))
    const clientRootRoute = new BaseRootRoute({})
    const clientIndexRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/',
      loader: clientLoader,
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientIndexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
    })
    clientRouter.options.serializationAdapters = [adapter]

    await hydrate(clientRouter)

    const loaderData = clientRouter.state.matches.at(-1)?.loaderData
    expect(loaderData).toBeInstanceOf(AdaptedValue)
    expect(loaderData).toEqual(new AdaptedValue('server loader data'))
    expect(clientLoader).not.toHaveBeenCalled()
  })

  it('round-trips a server root notFound lane as globalNotFound', async () => {
    const serverRootRoute = new BaseRootRoute({
      notFoundComponent: () => 'Not Found',
    })
    const serverMissingRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/missing',
      loader: () => {
        throw notFound({ data: { source: 'server loader' } })
      },
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverMissingRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
      isServer: true,
    })

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)

    expect(serverRouter.state.matches).toHaveLength(1)
    expect(serverRouter.state.matches[0]).toMatchObject({
      routeId: serverRootRoute.id,
      status: 'success',
      globalNotFound: true,
    })
    expect(isNotFound(serverRouter.state.matches[0]?.error)).toBe(true)

    const clientLoader = vi.fn(() => 'client data')
    const clientRootRoute = new BaseRootRoute({
      notFoundComponent: () => 'Not Found',
    })
    const clientMissingRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/missing',
      loader: clientLoader,
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientMissingRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(clientRouter.state.matches).toHaveLength(1)
    expect(clientRouter.state.matches[0]).toMatchObject({
      routeId: clientRootRoute.id,
      status: 'success',
      globalNotFound: true,
    })
    expect(isNotFound(clientRouter.state.matches[0]?.error)).toBe(true)
    expect(clientRouter.state.matches[0]?.error).toEqual(
      expect.objectContaining({ data: { source: 'server loader' } }),
    )
    expect(clientLoader).not.toHaveBeenCalled()
  })

  it('preserves matcher-owned globalNotFound when a compatibility payload omits the flag', async () => {
    const rootRoute = new BaseRootRoute({
      notFoundComponent: () => 'Not Found',
    })
    const knownRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/known',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([knownRoute]),
      history: createMemoryHistory({ initialEntries: ['/does-not-exist'] }),
      isServer: false,
    })
    const matcherOwnedMatches = router.matchRoutes(router.stores.location.get())
    expect(matcherOwnedMatches).toHaveLength(1)
    expect(matcherOwnedMatches[0]?.globalNotFound).toBe(true)

    mockWindow.$_TSR = createMockBootstrap({
      manifest: testManifest,
      dehydratedData: {},
      matches: matcherOwnedMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    })

    await hydrate(router)

    expect(router.state.matches).toHaveLength(1)
    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      status: 'success',
      globalNotFound: true,
    })
  })

  it('applies round-tripped custom hydration before matching a rewritten location', async () => {
    const rewrite: LocationRewrite = {
      input: ({ url }) => {
        if (url.pathname === '/public') {
          url.pathname = '/internal'
        }
        return url
      },
    }

    const serverRootRoute = new BaseRootRoute({})
    const serverInternalRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/internal',
      loader: () => 'server internal data',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverInternalRoute]),
      history: createMemoryHistory({ initialEntries: ['/public'] }),
      rewrite,
      dehydrate: () => ({ rewrite: true }),
      isServer: true,
    })

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)

    const clientLoader = vi.fn(() => 'client internal data')
    const clientRootRoute = new BaseRootRoute({})
    const clientInternalRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/internal',
      loader: clientLoader,
    })
    let clientRouter: AnyRouter
    const customHydrate = vi.fn((dehydrated: { rewrite?: boolean }) => {
      if (dehydrated.rewrite) {
        clientRouter.update({ rewrite })
      }
    })
    clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientInternalRoute]),
      history: createMemoryHistory({ initialEntries: ['/public'] }),
      hydrate: customHydrate,
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(customHydrate).toHaveBeenCalledOnce()
    expect(customHydrate).toHaveBeenCalledWith({ rewrite: true })
    expect(clientRouter.state.location.pathname).toBe('/internal')
    expect(clientRouter.state.location.publicHref).toBe('/public')
    expect(
      clientRouter.state.matches.map((match: AnyRouteMatch) => ({
        id: match.id,
        routeId: match.routeId,
        status: match.status,
        loaderData: match.loaderData,
      })),
    ).toEqual(
      serverRouter.state.matches.map((match) => ({
        id: match.id,
        routeId: match.routeId,
        status: match.status,
        loaderData: match.loaderData,
      })),
    )
    expect(clientLoader).not.toHaveBeenCalled()
  })

  it('records a notFound thrown by a route head on the hydrated match', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockHead.mockImplementation(() => {
      throw notFound({ data: { source: 'index head' } })
    })
    const matched = mockRouter.matchRoutes(mockRouter.stores.location.get())

    mockWindow.$_TSR = createMockBootstrap({
      manifest: testManifest,
      dehydratedData: {},
      matches: matched.map((match: AnyRouteMatch) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    })

    await hydrate(mockRouter)

    const match = mockRouter.state.matches.find(
      (candidate: AnyRouteMatch) => candidate.routeId === '/',
    ) as AnyRouteMatch | undefined
    expect(match).toBeDefined()
    expect(match?.status).toBe('success')
    expect(isNotFound(match?.error)).toBe(true)
    expect(match?.error).toEqual({ isNotFound: true })
    expect(mockHead).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalledWith(
      'NotFound error during hydration for routeId: /',
      expect.objectContaining({
        isNotFound: true,
        data: { source: 'index head' },
      }),
    )
  })
})
