import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import type { LocationRewrite } from '../src'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { AnyRouteMatch } from '../src'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = {
  routes: {},
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

  it('should throw error if window.$_TSR is not available', async () => {
    await expect(hydrate(mockRouter)).rejects.toThrow(
      'Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
    )
  })

  it('should throw error if window.$_TSR.router is not available', async () => {
    mockWindow.$_TSR = {
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
      // router is missing
    } as any

    await expect(hydrate(mockRouter)).rejects.toThrow(
      'Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
    )
  })

  it('should initialize serialization adapters when provided', async () => {
    const mockSerializer = {
      key: 'testAdapter',
      fromSerializable: vi.fn(),
      toSerializable: vi.fn(),
      test: vi.fn().mockReturnValue(true),
      '~types': {
        input: {},
        output: {},
        extends: {},
      },
    }

    mockRouter.options.serializationAdapters = [mockSerializer]

    const mockMatches = [{ id: '/', routeId: '/', index: 0, _: {} }]
    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    const mockBuffer = [vi.fn(), vi.fn()]
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
      buffer: mockBuffer,
      initialized: false,
    }

    await hydrate(mockRouter)

    expect(mockWindow.$_TSR.t).toBeInstanceOf(Map)
    expect(mockWindow.$_TSR.t?.get('testAdapter')).toBe(
      mockSerializer.fromSerializable,
    )
    expect(mockBuffer[0]).toHaveBeenCalled()
    expect(mockBuffer[1]).toHaveBeenCalled()
    expect(mockWindow.$_TSR.initialized).toBe(true)
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

  it('should set manifest in router.ssr', async () => {
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

    expect(mockRouter.ssr).toEqual({
      manifest: testManifest,
    })
  })

  it('should hydrate matches', async () => {
    const mockMatches = [
      {
        id: '/',
        routeId: '/',
        index: 0,
        ssr: undefined,
        _: {},
      },
      {
        id: '/other',
        routeId: '/other',
        index: 1,
        ssr: undefined,
        _: { loadPromise: createControlledPromise<void>() },
      },
    ]

    const dehydratedMatches = [
      {
        i: '/',
        l: { indexData: 'server-data' },
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

    const { id, loaderData, ssr, status } = mockMatches[0] as AnyRouteMatch
    expect(id).toBe('/')
    expect(loaderData).toEqual({ indexData: 'server-data' })
    expect(status).toBe('success')
    expect(ssr).toBe(true)
  })

  it('clears loadPromise references after fully SSR hydration', async () => {
    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: matches[matches.length - 1]!.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(mockRouter)

    expect(
      mockRouter.state.matches.every(
        (match: AnyRouteMatch) => match._.loadPromise === undefined,
      ),
    ).toBe(true)
  })

  it('fully SSR hydration runs no client loader and executes head and scripts once', async () => {
    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    const targetMatch = matches[matches.length - 1]!
    const targetRoute = mockRouter.routesById[targetMatch.routeId]
    const loader = vi.fn(() => 'client-loader')
    const scripts = vi.fn(() => [{ children: 'hydrated-script' }])
    const loadSpy = vi.spyOn(mockRouter, 'load')

    targetRoute.options.loader = loader
    targetRoute.options.scripts = scripts
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: matches[matches.length - 1]!.id,
        matches: matches.map((match) => ({
          i: match.id,
          l: match.id === targetMatch.id ? 'server-loader' : undefined,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
        })),
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
    expect(loader).not.toHaveBeenCalled()
    expect(mockHead).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(targetMatch.loaderData).toBe('server-loader')
    expect(targetMatch.scripts).toEqual([{ children: 'hydrated-script' }])
  })

  it('selective SSR hydration client-loads ssr false shell matches', async () => {
    const rootBeforeLoad = vi.fn(() => ({ root: 'client' }))
    const childBeforeLoad = vi.fn(() => ({ child: 'client' }))
    const rootLoader = vi.fn(({ context }) => ({
      root: context.root,
    }))
    const childLoader = vi.fn(({ context }) => ({
      child: context.child,
    }))
    const history = createMemoryHistory({ initialEntries: ['/child'] })
    const rootRoute = new BaseRootRoute({
      beforeLoad: rootBeforeLoad,
      loader: rootLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
    }).lazy(() =>
      Promise.resolve({
        options: {
          ssr: () => {
            throw new Error('ssr should not run on the client')
          },
          beforeLoad: childBeforeLoad,
          loader: childLoader,
        },
      } as any),
    )
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history,
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: matches[matches.length - 1]!.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'pending' as const,
          ssr: false,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)
    await Promise.resolve()

    expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childBeforeLoad).toHaveBeenCalledTimes(1)
    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(childRoute.options.ssr).toBe(false)
    await vi.waitFor(() => {
      const loadedMatches = router.state.matches
      const rootMatch = loadedMatches.find(
        (match) => match.routeId === rootRoute.id,
      )
      const childMatch = loadedMatches.find(
        (match) => match.routeId === childRoute.id,
      )

      expect(rootMatch?.loaderData).toEqual({ root: 'client' })
      expect(childMatch?.loaderData).toEqual({ child: 'client' })
    })
  })

  it('keeps SPA display pending when the initial client load does not commit final matches', async () => {
    vi.useFakeTimers()
    try {
      const history = createMemoryHistory({ initialEntries: ['/other'] })
      const rootRoute = new BaseRootRoute({})
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        loader: () => 'other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([otherRoute]),
        history,
        isServer: false,
      })
      const matches = router.matchRoutes(router.stores.location.get())
      const displayMatch = matches[1]!

      router.load = vi.fn(async () => {
        router.cancelMatches()
        router.stores.isLoading.set(true)
      })

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: matches[0]!.id,
          matches: [
            {
              i: matches[0]!.id,
              s: 'success' as const,
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

      await hydrate(router)
      await vi.runOnlyPendingTimersAsync()

      expect(router.load).toHaveBeenCalledTimes(1)

      const currentDisplayMatch = router.getMatch(displayMatch.id)
      if (!currentDisplayMatch) {
        throw new Error('expected display match to remain mounted')
      }

      expect(currentDisplayMatch.status).toBe('pending')
      expect(currentDisplayMatch._displayPending).toBe(true)
      expect(currentDisplayMatch._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears SPA display pending after a follow-up client load commits final matches', async () => {
    vi.useFakeTimers()
    try {
      const followUpLoad = createControlledPromise<void>()
      const history = createMemoryHistory({ initialEntries: ['/other'] })
      const rootRoute = new BaseRootRoute({})
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        loader: () => 'other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([otherRoute]),
        history,
        isServer: false,
      })
      const matches = router.matchRoutes(router.stores.location.get())
      const displayMatch = matches[1]!

      router.load = vi.fn(async () => {
        router.cancelMatches()
        router.stores.isLoading.set(true)
        router.latestLoadPromise = followUpLoad
      })

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: matches[0]!.id,
          matches: [
            {
              i: matches[0]!.id,
              s: 'success' as const,
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

      await hydrate(router)
      await vi.runOnlyPendingTimersAsync()

      const waitingDisplayMatch = router.getMatch(displayMatch.id)
      if (!waitingDisplayMatch) {
        throw new Error('expected display match to wait for follow-up load')
      }

      expect(waitingDisplayMatch._displayPending).toBe(true)

      router.updateMatch(displayMatch.id, (match) => ({
        ...match,
        status: 'success' as const,
      }))
      router.stores.isLoading.set(false)
      followUpLoad.resolve()
      await Promise.resolve()

      const currentDisplayMatch = router.getMatch(displayMatch.id)
      if (!currentDisplayMatch) {
        throw new Error('expected display match to remain mounted')
      }

      expect(currentDisplayMatch._displayPending).toBeUndefined()
      expect(currentDisplayMatch._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears data-only display pending after route chunks and pendingMinMs', async () => {
    vi.useFakeTimers()
    try {
      mockRouter.options.defaultPendingComponent = () => null
      mockRouter.options.defaultPendingMinMs = 500
      const matches = mockRouter.matchRoutes(
        mockRouter.stores.location.get(),
      ) as Array<AnyRouteMatch>
      const dataOnlyMatch = matches[matches.length - 1]!
      mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: dataOnlyMatch.id,
          matches: matches.map((match) => ({
            i: match.id,
            s: 'success' as const,
            ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
            u: Date.now(),
          })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      await hydrate(mockRouter)

      const displayMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(displayMatch._displayPending).toBe(true)
      expect(displayMatch._.loadPromise).toBeUndefined()

      await vi.advanceTimersByTimeAsync(500)

      const updatedMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
      expect(updatedMatch._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses elapsed SSR-visible time for fast data-only hydration pending minimum', async () => {
    vi.useFakeTimers()
    try {
      const headGate = createControlledPromise<void>()
      mockHead.mockReturnValue(headGate)
      mockRouter.options.defaultPendingComponent = () => null
      mockRouter.options.defaultPendingMinMs = 100

      const matches = mockRouter.matchRoutes(
        mockRouter.stores.location.get(),
      ) as Array<AnyRouteMatch>
      const dataOnlyMatch = matches[matches.length - 1]!
      mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: dataOnlyMatch.id,
          matches: matches.map((match) => ({
            i: match.id,
            s: 'success' as const,
            ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
            u: Date.now(),
          })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      const hydration = hydrate(mockRouter)
      await Promise.resolve()

      const displayMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch

      expect(displayMatch._displayPending).toBe(true)

      await vi.advanceTimersByTimeAsync(20)
      headGate.resolve()
      await hydration

      await vi.advanceTimersByTimeAsync(79)
      expect(mockRouter.getMatch(dataOnlyMatch.id)._displayPending).toBe(true)
      expect(
        mockRouter.getMatch(dataOnlyMatch.id)._.loadPromise,
      ).toBeUndefined()

      await vi.advanceTimersByTimeAsync(1)

      const updatedMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
      expect(updatedMatch._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not add a fresh minimum after slow data-only hydration work', async () => {
    vi.useFakeTimers()
    try {
      const headGate = createControlledPromise<void>()
      mockHead.mockReturnValue(headGate)
      mockRouter.options.defaultPendingComponent = () => null
      mockRouter.options.defaultPendingMinMs = 100

      const matches = mockRouter.matchRoutes(
        mockRouter.stores.location.get(),
      ) as Array<AnyRouteMatch>
      const dataOnlyMatch = matches[matches.length - 1]!
      mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: dataOnlyMatch.id,
          matches: matches.map((match) => ({
            i: match.id,
            s: 'success' as const,
            ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
            u: Date.now(),
          })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      const hydration = hydrate(mockRouter)
      await Promise.resolve()

      const displayMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch

      expect(displayMatch._displayPending).toBe(true)

      await vi.advanceTimersByTimeAsync(150)
      headGate.resolve()
      await hydration

      const updatedMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
      expect(updatedMatch._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up data-only display pending when head hydration throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const headError = new Error('head failed')
    mockHead.mockImplementation(() => {
      throw headError
    })
    mockRouter.options.defaultPendingComponent = () => null
    mockRouter.options.defaultPendingMinMs = 500
    const updateMatchSpy = vi.spyOn(mockRouter, 'updateMatch')

    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    const dataOnlyMatch = matches[matches.length - 1]!
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: dataOnlyMatch.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await expect(hydrate(mockRouter)).rejects.toThrow(headError)

    const updatedMatch = mockRouter.getMatch(dataOnlyMatch.id) as AnyRouteMatch
    expect(updatedMatch._displayPending).toBeUndefined()
    expect(updatedMatch._.loadPromise).toBeUndefined()
    expect(updateMatchSpy).toHaveBeenCalledWith(
      dataOnlyMatch.id,
      expect.any(Function),
    )

    consoleSpy.mockRestore()
  })

  it('runs hydration head work after route chunks resolve', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const headError = new Error('head failed')
    const headGate = createControlledPromise<void>()
    const routeChunkGate = createControlledPromise<void>()
    mockHead.mockReturnValue(headGate)
    vi.spyOn(mockRouter, 'loadRouteChunk').mockReturnValue(routeChunkGate)

    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: matches[matches.length - 1]!.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    try {
      const hydration = hydrate(mockRouter)
      await Promise.resolve()

      expect(mockHead).not.toHaveBeenCalled()

      routeChunkGate.resolve()
      await vi.waitFor(() => expect(mockHead).toHaveBeenCalled())

      headGate.reject(headError)
      await expect(hydration).rejects.toThrow(headError)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('lazy route head rejection after chunk resolution cleans up display pending', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const headError = new Error('head failed')
    const routeChunkGate = createControlledPromise<void>()
    const head = vi.fn(() => {
      throw headError
    })
    const scripts = vi.fn(() => [{ children: 'hydrated-script' }])
    mockRouter.options.defaultPendingComponent = () => null
    mockRouter.options.defaultPendingMinMs = 500

    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    const dataOnlyMatch = matches[matches.length - 1]!
    const dataOnlyRoute = mockRouter.routesById[dataOnlyMatch.routeId]
    dataOnlyRoute.options.head = undefined
    dataOnlyRoute.options.scripts = undefined
    vi.spyOn(mockRouter, 'loadRouteChunk').mockReturnValue(
      routeChunkGate.then(() => {
        dataOnlyRoute.options.head = head
        dataOnlyRoute.options.scripts = scripts
      }),
    )
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: dataOnlyMatch.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    try {
      const hydration = hydrate(mockRouter)
      await Promise.resolve()

      const displayMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(displayMatch._displayPending).toBe(true)

      routeChunkGate.resolve()
      await expect(hydration).rejects.toThrow(headError)

      const updatedMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(head).toHaveBeenCalledTimes(1)
      expect(scripts).not.toHaveBeenCalled()
      expect(updatedMatch._displayPending).toBeUndefined()
      expect(updatedMatch._.loadPromise).toBeUndefined()
      expect(consoleSpy).not.toHaveBeenCalledWith(
        'Error during router hydration:',
        expect.anything(),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('route-chunk rejection rejects before hydration head work starts', async () => {
    const chunkError = new Error('chunk failed')
    const unhandledRejection = vi.fn()
    let rejectedChunk = false
    mockRouter.options.defaultPendingComponent = () => null
    mockRouter.options.defaultPendingMinMs = 500
    vi.spyOn(mockRouter, 'loadRouteChunk').mockImplementation(() => {
      if (rejectedChunk) {
        return Promise.resolve()
      }
      rejectedChunk = true
      return Promise.reject(chunkError)
    })

    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    const dataOnlyMatch = matches[matches.length - 1]!
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: dataOnlyMatch.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    process.on('unhandledRejection', unhandledRejection)

    try {
      const hydrationError = hydrate(mockRouter).catch((err) => err)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(unhandledRejection).not.toHaveBeenCalled()
      expect(mockHead).not.toHaveBeenCalled()

      await expect(hydrationError).resolves.toBe(chunkError)

      const updatedMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
      expect(updatedMatch._.loadPromise).toBeUndefined()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })

  it('settles hydration load promises when route chunk loading rejects', async () => {
    const chunkError = new Error('chunk failed')
    const routeChunkGate = createControlledPromise<void>()
    mockRouter.options.defaultPendingComponent = () => null
    mockRouter.options.defaultPendingMinMs = 500
    vi.spyOn(mockRouter, 'loadRouteChunk').mockReturnValue(routeChunkGate)
    const updateMatchSpy = vi.spyOn(mockRouter, 'updateMatch')
    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    const dataOnlyMatch = matches[matches.length - 1]!
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: dataOnlyMatch.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    const hydration = hydrate(mockRouter)
    setTimeout(() => routeChunkGate.reject(chunkError), 0)

    await expect(hydration).rejects.toThrow(chunkError)
    expect(
      matches.every(
        (match: AnyRouteMatch) => match._.loadPromise === undefined,
      ),
    ).toBe(true)
    expect(
      mockRouter.getMatch(dataOnlyMatch.id)._displayPending,
    ).toBeUndefined()
    expect(updateMatchSpy).toHaveBeenCalledWith(
      dataOnlyMatch.id,
      expect.any(Function),
    )
  })

  it('fully SSR route-chunk rejection does not mark location resolved', async () => {
    const chunkError = new Error('chunk failed')
    const routeChunkGate = createControlledPromise<void>()
    vi.spyOn(mockRouter, 'loadRouteChunk').mockReturnValue(routeChunkGate)
    const matches = mockRouter.matchRoutes(
      mockRouter.stores.location.get(),
    ) as Array<AnyRouteMatch>
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: matches[matches.length - 1]!.id,
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    const hydration = hydrate(mockRouter)
    routeChunkGate.reject(chunkError)

    await expect(hydration).rejects.toThrow(chunkError)
    expect(mockRouter.stores.resolvedLocation.get()).toBeUndefined()
  })

  it('should hydrate globalNotFound when dehydrated flag is present', async () => {
    const mockMatches = [
      {
        id: '/',
        routeId: '/',
        index: 0,
        ssr: undefined,
        _: {},
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
        _: {},
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
        _: {},
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
        _: {},
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

  it('should run custom hydration before matching routes', async () => {
    const history = createMemoryHistory({ initialEntries: ['/public'] })

    const rootRoute = new BaseRootRoute({})
    const internalRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/internal',
      component: () => 'Internal',
    })

    const rewrite: LocationRewrite = {
      input: ({ url }) => {
        if (url.pathname === '/public') {
          url.pathname = '/internal'
        }
        return url
      },
    }

    mockRouter = createTestRouter({
      routeTree: rootRoute.addChildren([internalRoute]),
      history,
      isServer: true,
      hydrate: (dehydrated: { rewrite?: boolean }) => {
        if (dehydrated.rewrite) {
          mockRouter.update({ rewrite })
        }
      },
    })

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: { rewrite: true },
        lastMatchId: '/internal/internal',
        matches: [
          {
            i: '__root__/',
            s: 'success',
            ssr: true,
            u: Date.now(),
          },
          {
            i: '/internal/internal',
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

    expect(mockRouter.state.location.pathname).toBe('/internal')
    expect(mockRouter.state.location.publicHref).toBe('/public')
    expect(
      mockRouter.state.matches.map((match: AnyRouteMatch) => match.routeId),
    ).toEqual(['__root__', '/internal'])
  })

  it('uses router options updated by custom hydration after the hook', async () => {
    vi.useFakeTimers()
    try {
      mockRouter.options.hydrate = () => {
        mockRouter.update({
          defaultPendingComponent: () => null,
          defaultPendingMinMs: 500,
        })
      }

      const matches = mockRouter.matchRoutes(
        mockRouter.stores.location.get(),
      ) as Array<AnyRouteMatch>
      const dataOnlyMatch = matches[matches.length - 1]!
      mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: dataOnlyMatch.id,
          matches: matches.map((match) => ({
            i: match.id,
            s: 'success' as const,
            ssr: match === dataOnlyMatch ? ('data-only' as const) : true,
            u: Date.now(),
          })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      await hydrate(mockRouter)

      const displayMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch

      expect(displayMatch._displayPending).toBe(true)
      expect(displayMatch._.loadPromise).toBeUndefined()

      await vi.advanceTimersByTimeAsync(500)

      const updatedMatch = mockRouter.getMatch(
        dataOnlyMatch.id,
      ) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
      expect(updatedMatch._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should handle errors during route context hydration', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockHead.mockImplementation(() => {
      throw notFound()
    })

    const mockMatches = [{ id: '/', routeId: '/', index: 0, ssr: true, _: {} }]

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

  it('SPA display fallback outlives its own match loadPromise', async () => {
    const childGate = createControlledPromise<void>()
    const history = createMemoryHistory({ initialEntries: ['/parent/child'] })
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'parent',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        await childGate
        return 'child'
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history,
      isServer: false,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })
    ;(router.options as any).defaultPendingComponent = () => null
    const matches = router.matchRoutes(router.stores.location.get())

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/not-the-current-leaf',
        matches: [
          {
            i: matches[0]!.id,
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

    await hydrate(router)
    await Promise.resolve()

    await vi.waitFor(() => {
      const parent = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      ) as AnyRouteMatch
      expect(parent.status).toBe('success')
      expect(parent._displayPending).toBe(true)
      expect(parent._.loadPromise).toBeUndefined()
    })

    expect(router.stores.status.get()).toBe('pending')
    expect(router.stores.resolvedLocation.get()).toBeUndefined()

    childGate.resolve()

    await vi.waitFor(() => expect(router.stores.status.get()).toBe('idle'))

    const currentParent = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    ) as AnyRouteMatch
    expect(currentParent._displayPending).toBeUndefined()
    expect(currentParent._.loadPromise).toBeUndefined()
    expect(router.stores.resolvedLocation.get()).toEqual(
      router.stores.location.get(),
    )
  })

  it('keeps SPA hydration fallback through pendingMinMs after load completes', async () => {
    vi.useFakeTimers()
    try {
      let resolveRouterLoad!: () => void
      const routerLoadPromise = new Promise<void>((resolve) => {
        resolveRouterLoad = resolve
      })
      vi.spyOn(mockRouter, 'load').mockReturnValue(routerLoadPromise)
      mockRouter.options.defaultPendingComponent = () => null
      mockRouter.options.defaultPendingMinMs = 500

      const matches = mockRouter.matchRoutes(mockRouter.stores.location.get())
      mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: '/not-the-current-leaf',
          matches: [
            {
              i: matches[0].id,
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
      await Promise.resolve()

      const match = mockRouter.stores.matches.get()[1] as AnyRouteMatch

      expect(match._displayPending).toBe(true)

      resolveRouterLoad()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(499)

      expect(mockRouter.getMatch(match.id)._displayPending).toBe(true)

      await vi.advanceTimersByTimeAsync(1)

      const updatedMatch = mockRouter.getMatch(match.id) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up SPA display pending when router.load rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loadError = new Error('router load failed')
    vi.spyOn(mockRouter, 'load').mockRejectedValue(loadError)
    mockRouter.options.defaultPendingComponent = () => null
    mockRouter.options.defaultPendingMinMs = 0

    const matches = mockRouter.matchRoutes(mockRouter.stores.location.get())
    mockRouter.matchRoutes = vi.fn().mockReturnValue(matches)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/not-the-current-leaf',
        matches: [
          {
            i: matches[0].id,
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

    const match = mockRouter.stores.matches.get()[1] as AnyRouteMatch

    expect(match._displayPending).toBe(true)

    await vi.waitFor(() => {
      const updatedMatch = mockRouter.getMatch(match.id) as AnyRouteMatch
      expect(updatedMatch._displayPending).toBeUndefined()
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error during router hydration:',
      loadError,
    )

    consoleSpy.mockRestore()
  })

  it('SPA route-chunk failure rejects before starting router.load', async () => {
    const chunkError = new Error('chunk failed')
    const routeChunkGate = createControlledPromise<void>()
    const childLoader = vi.fn()
    const history = createMemoryHistory({ initialEntries: ['/parent/child'] })
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'parent',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history,
      isServer: false,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })
    ;(router.options as any).defaultPendingComponent = () => null
    const matches = router.matchRoutes(router.stores.location.get())
    const childMatch = matches.find(
      (match) => match.routeId === childRoute.id,
    ) as AnyRouteMatch
    router.matchRoutes = vi.fn().mockReturnValue(matches)

    let routeChunkCalls = 0
    vi.spyOn(router, 'loadRouteChunk').mockImplementation(() => {
      routeChunkCalls++
      return routeChunkCalls <= matches.length ? routeChunkGate : undefined
    })
    const load = router.load.bind(router)
    vi.spyOn(router, 'load').mockImplementation((opts) => {
      return load(opts)
    })

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: '/not-the-current-leaf',
        matches: [
          {
            i: matches[0]!.id,
            s: 'success' as const,
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

    const hydration = hydrate(router)
    await Promise.resolve()

    routeChunkGate.reject(chunkError)

    await expect(hydration).rejects.toThrow(chunkError)

    const currentChild = router.getMatch(childMatch.id) as AnyRouteMatch
    expect(currentChild).toBe(childMatch)
    expect(router.load).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })
})
