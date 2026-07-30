import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createSerializationAdapter,
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
    // Reset global window mock
    mockWindow = {}
    ;(global as any).window = mockWindow

    // Reset mock head function
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

    const otherRoute = new BaseRoute({
      getParentRoute: () => indexRoute,
      path: '/other',
      component: () => 'Other',
    })

    const routeTree = rootRoute.addChildren([
      indexRoute.addChildren([otherRoute]),
    ])

    mockRouter = createTestRouter({ routeTree, history, isServer: true })
  })

  afterEach(() => {
    vi.resetAllMocks()
    delete (global as any).window
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

  it('clears hydration preflight when the custom hydrate hook rejects', async () => {
    const error = new Error('custom hydration failed')
    mockWindow.$_TSR = createMockBootstrap({
      manifest: testManifest,
      dehydratedData: {},
      matches: [],
    })
    mockRouter.options.hydrate = () => Promise.reject(error)

    await expect(hydrate(mockRouter)).rejects.toBe(error)

    expect(mockRouter._preflight).toBeUndefined()
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

  it('should handle empty serialization adapters', async () => {
    mockRouter.options.serializationAdapters = []

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/',
        matches: [],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    expect(mockWindow.$_TSR.t).toBeUndefined()
    expect(mockWindow.$_TSR.initialized).toBe(true)
  })

  it('round-trips the manifest and matches without running client loaders', async () => {
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

  it('restores undefined loader data without serializing it', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/page',
      loader: () => undefined,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)
    expect(mockWindow.$_TSR.router?.matches[1]).not.toHaveProperty('l')

    const clientLoader = vi.fn(() => undefined)
    const clientRootRoute = new BaseRootRoute({})
    const clientRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/page',
      loader: clientLoader,
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(clientLoader).not.toHaveBeenCalled()
    const match = clientRouter.state.matches[1]
    expect(match).toMatchObject({
      routeId: clientRoute.id,
      status: 'success',
    })
    expect(match).toHaveProperty('loaderData', undefined)
  })

  it('should hydrate globalNotFound when dehydrated flag is present', async () => {
    const mockMatches = [
      {
        id: '/',
        routeId: '/',
        index: 0,
        ssr: undefined,
        _nonReactive: {},
      },
    ]

    const dehydratedMatches = [
      {
        i: '/',
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
        g: true as const,
      },
    ]

    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/',
        matches: dehydratedMatches,
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    expect((mockMatches[0] as AnyRouteMatch).globalNotFound).toBe(true)
  })

  it('should leave globalNotFound undefined when dehydrated flag is omitted', async () => {
    const mockMatches = [
      {
        id: '/',
        routeId: '/',
        index: 0,
        ssr: undefined,
        _nonReactive: {},
      },
    ]

    const dehydratedMatches = [
      {
        i: '/',
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      },
    ]

    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/',
        matches: dehydratedMatches,
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    expect((mockMatches[0] as AnyRouteMatch).globalNotFound).toBeUndefined()
  })

  it('should preserve existing globalNotFound when dehydrated flag is omitted', async () => {
    const mockMatches = [
      {
        id: '/',
        routeId: '/',
        index: 0,
        ssr: undefined,
        _nonReactive: {},
        globalNotFound: true,
      },
    ]

    const dehydratedMatches = [
      {
        i: '/',
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      },
    ]

    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/',
        matches: dehydratedMatches,
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    expect((mockMatches[0] as AnyRouteMatch).globalNotFound).toBe(true)
  })

  it('should decode dehydrated match ids before hydration lookup and SPA-mode checks', async () => {
    const loadSpy = vi.spyOn(mockRouter, 'load')

    const mockMatches = [
      {
        id: '/',
        routeId: '/',
        index: 0,
        ssr: undefined,
        _nonReactive: {},
      },
    ]

    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: dehydrateSsrMatchId('/'),
        matches: [
          {
            i: dehydrateSsrMatchId('/'),
            l: { indexData: 'server-data' },
            s: 'success',
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    expect(loadSpy).not.toHaveBeenCalled()
    expect((mockRouter.state.matches[0] as AnyRouteMatch).id).toBe('/')
  })

  it('applies round-tripped custom hydration before matching a rewritten location', async () => {
    const rewrite: LocationRewrite = {
      input: ({ url }) => {
        if (url.pathname === '/public') {
          url.pathname = '/internal'
        }
        return url
      },
      output: ({ url }) => {
        if (url.pathname === '/internal') {
          url.pathname = '/public'
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
        routeId: match.routeId,
        status: match.status,
        loaderData: match.loaderData,
      })),
    ).toEqual([
      {
        routeId: clientRootRoute.id,
        status: 'success',
        loaderData: undefined,
      },
      {
        routeId: clientInternalRoute.id,
        status: 'success',
        loaderData: 'server internal data',
      },
    ])
    expect(clientLoader).not.toHaveBeenCalled()
  })

  it('should handle errors during route context hydration', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockHead.mockImplementation(() => {
      throw notFound()
    })

    const mockMatches = [
      { id: '/', routeId: '/', index: 0, ssr: true, _nonReactive: {} },
    ]

    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/',
        matches: [
          {
            i: '/',
            l: { data: 'test' },
            s: 'success',
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    const match = mockRouter.state.matches[0] as AnyRouteMatch
    expect(match.error).toEqual({ isNotFound: true })

    expect(consoleSpy).toHaveBeenCalledWith(
      'NotFound error during hydration for routeId: /',
      expect.objectContaining({
        isNotFound: true,
      }),
    )

    consoleSpy.mockRestore()
  })
})
