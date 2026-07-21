import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
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

  it('clears hydration preflight when location reconstruction rejects', async () => {
    const error = new Error('location parsing failed')
    mockWindow.$_TSR = createMockBootstrap({
      manifest: testManifest,
      dehydratedData: {},
      matches: [],
    })
    mockRouter.options.hydrate = () => {
      mockRouter.options.parseSearch = () => {
        throw error
      }
    }

    await expect(hydrate(mockRouter)).rejects.toBe(error)

    expect(mockRouter._preflight).toBeUndefined()
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

  it('uses hydrated undefined loader data to select a child-first revalidation boundary', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      loader: () => undefined,
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      loader: () => 'server child data',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)

    const parentFailure = new Error('parent revalidation failed')
    const parentGate = createControlledPromise<void>()
    const childGate = createControlledPromise<void>()
    const parentStarted = createControlledPromise<void>()
    const childStarted = createControlledPromise<void>()
    const parentSettled = createControlledPromise<void>()
    const childSettled = createControlledPromise<void>()
    const settlements: Array<string> = []
    const clientParentLoader = vi.fn(async () => {
      parentStarted.resolve()
      await parentGate
      settlements.push('parent')
      parentSettled.resolve()
      throw parentFailure
    })
    const clientChildLoader = vi.fn(async () => {
      childStarted.resolve()
      await childGate
      settlements.push('child')
      childSettled.resolve()
      throw notFound()
    })
    const clientRootRoute = new BaseRootRoute({})
    const clientParentRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/parent',
      loader: clientParentLoader,
      errorComponent: () => null,
    })
    const clientChildRoute = new BaseRoute({
      getParentRoute: () => clientParentRoute,
      path: '/child',
      loader: clientChildLoader,
      notFoundComponent: () => null,
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([
        clientParentRoute.addChildren([clientChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: false,
      defaultStaleReloadMode: 'blocking',
    })

    await hydrate(clientRouter)

    expect(clientParentLoader).not.toHaveBeenCalled()
    expect(clientChildLoader).not.toHaveBeenCalled()
    expect(clientRouter.state.matches[1]).toMatchObject({
      routeId: clientParentRoute.id,
      status: 'success',
      loaderData: undefined,
    })
    expect(clientRouter.state.matches[2]).toMatchObject({
      routeId: clientChildRoute.id,
      status: 'success',
      loaderData: 'server child data',
    })

    const revalidation = clientRouter.invalidate()
    await Promise.all([parentStarted, childStarted])
    childGate.resolve()
    await childSettled
    parentGate.resolve()
    await parentSettled
    await revalidation

    expect(settlements).toEqual(['child', 'parent'])
    const terminalMatch = clientRouter.state.matches.find(
      (match) => match.status === 'error' || match.status === 'notFound',
    )
    expect(terminalMatch).toMatchObject({
      routeId: clientChildRoute.id,
      status: 'notFound',
    })
    expect(isNotFound(terminalMatch?.error)).toBe(true)
    expect(clientRouter.state.matches[1]).toMatchObject({
      routeId: clientParentRoute.id,
      status: 'success',
      loaderData: undefined,
    })
  })

  it.each([
    ['mismatched', dehydrateSsrMatchId('/different-match')],
    ['missing', undefined],
    ['non-string', 42],
  ])(
    'does not attach dehydrated data with a %s match identity',
    async (_, identity) => {
      const serverRootRoute = new BaseRootRoute({})
      const serverProductRoute = new BaseRoute({
        getParentRoute: () => serverRootRoute,
        path: '/products/$productId',
        loader: () => 'server data',
      })
      const serverRouter = createTestRouter({
        routeTree: serverRootRoute.addChildren([serverProductRoute]),
        history: createMemoryHistory({ initialEntries: ['/products/42'] }),
        isServer: true,
      })

      mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)
      mockWindow.$_TSR.router!.matches[1]!.i = identity as string

      const clientLoader = vi.fn(() => 'client data')
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

      const pendingMatch = clientRouter.state.matches.at(-1)
      expect(pendingMatch).toMatchObject({
        routeId: clientProductRoute.id,
        status: 'pending',
      })
      expect(pendingMatch).not.toHaveProperty('loaderData')
      expect(clientLoader).not.toHaveBeenCalled()

      await clientRouter.load()

      expect(clientRouter.state.matches.at(-1)).toMatchObject({
        routeId: clientProductRoute.id,
        status: 'success',
        loaderData: 'client data',
      })
      expect(clientLoader).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps an earlier data-only boundary when a descendant id mismatches', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      ssr: 'data-only',
      loader: () => 'server parent data',
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      loader: () => 'server child data',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)
    mockWindow.$_TSR.router!.matches[2]!.i = dehydrateSsrMatchId(
      '/different-child-match',
    )

    const childContext = vi.fn(() => ({ source: 'client child context' }))
    const clientRootRoute = new BaseRootRoute({})
    const clientParentLoader = vi.fn(() => 'client parent data')
    const clientParentRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/parent',
      ssr: 'data-only',
      loader: clientParentLoader,
    })
    const clientChildRoute = new BaseRoute({
      getParentRoute: () => clientParentRoute,
      path: '/child',
      context: childContext,
      loader: () => 'client child data',
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([
        clientParentRoute.addChildren([clientChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(clientRouter.state.matches[1]).toMatchObject({
      routeId: clientParentRoute.id,
      status: 'pending',
      loaderData: 'server parent data',
    })
    expect(childContext).not.toHaveBeenCalled()
    expect(clientParentLoader).not.toHaveBeenCalled()

    await clientRouter.load()

    expect(childContext).toHaveBeenCalledTimes(1)
    expect(clientParentLoader).not.toHaveBeenCalled()
    expect(clientRouter.state.matches[1]).toMatchObject({
      routeId: clientParentRoute.id,
      status: 'success',
      loaderData: 'server parent data',
    })
    expect(clientRouter.state.matches[2]).toMatchObject({
      routeId: clientChildRoute.id,
      status: 'success',
      loaderData: 'client child data',
    })
  })

  it('rejects a longer non-terminal server lane before attaching its data', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      loader: () => 'server data',
    })
    const serverIndexRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverIndexRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
      isServer: true,
    })

    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)
    expect(mockWindow.$_TSR.router?.matches).toHaveLength(3)

    const clientLoader = vi.fn(() => 'client data')
    const clientRootRoute = new BaseRootRoute({})
    const clientParentRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/parent',
      loader: clientLoader,
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientParentRoute]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(clientRouter.state.resolvedLocation).toBeUndefined()
    expect(clientRouter.state.matches.at(-1)).not.toHaveProperty('loaderData')
    expect(clientLoader).not.toHaveBeenCalled()

    await clientRouter.load()

    expect(clientRouter.state.matches.at(-1)).toMatchObject({
      routeId: clientParentRoute.id,
      status: 'success',
      loaderData: 'client data',
    })
    expect(clientLoader).toHaveBeenCalledTimes(1)
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

  it('round-trips a server root notFound lane as _notFound', async () => {
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

    expect(serverRouter.state.matches).toHaveLength(2)
    expect(serverRouter.state.matches[0]).toMatchObject({
      routeId: serverRootRoute.id,
      status: 'success',
      _notFound: true,
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

    expect(clientRouter.state.matches).toHaveLength(2)
    expect(clientRouter.state.matches[0]).toMatchObject({
      routeId: clientRootRoute.id,
      status: 'success',
      _notFound: true,
    })
    expect(clientRouter.state.matches[1]).toMatchObject({
      routeId: clientMissingRoute.id,
      status: 'pending',
    })
    expect(isNotFound(clientRouter.state.matches[0]?.error)).toBe(true)
    expect(clientRouter.state.matches[0]?.error).toEqual(
      expect.objectContaining({ data: { source: 'server loader' } }),
    )
    expect(clientLoader).not.toHaveBeenCalled()
  })

  it('preserves a client-matched _notFound when a shell payload omits the flag', async () => {
    const serverRootRoute = new BaseRootRoute({
      notFoundComponent: () => 'Not Found',
    })
    const serverKnownRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/known',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverKnownRoute]),
      history: createMemoryHistory({ initialEntries: ['/known'] }),
      isServer: true,
      isShell: true,
    })
    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter)

    const clientRootRoute = new BaseRootRoute({
      notFoundComponent: () => 'Not Found',
    })
    const clientKnownRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/known',
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientKnownRoute]),
      history: createMemoryHistory({ initialEntries: ['/does-not-exist'] }),
      isServer: false,
    })

    await hydrate(clientRouter)

    expect(clientRouter.state.matches).toHaveLength(1)
    expect(clientRouter.state.matches[0]).toMatchObject({
      routeId: clientRootRoute.id,
      status: 'success',
      _notFound: true,
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

  it('logs and swallows a notFound thrown by a hydrated route head', async () => {
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
    expect(match?.error).toBeUndefined()
    expect(mockHead).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isNotFound: true,
        data: { source: 'index head' },
      }),
    )
  })
})
