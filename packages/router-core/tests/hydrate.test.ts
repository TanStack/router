import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore, notFound } from '../src'
import { hydrate } from '../src/ssr/client'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { AnyRouteMatch } from '../src'

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

    mockRouter = new RouterCore({ routeTree, history, isServer: true })
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

    const mockMatches = [{ id: '/', routeId: '/', index: 0, _nonReactive: {} }]
    mockRouter.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    mockRouter.state.matches = mockMatches

    const mockBuffer = [vi.fn(), vi.fn()]
    mockWindow.$_TSR = {
      router: {
        manifest: { routes: {} },
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
        manifest: { routes: {} },
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
    const testManifest = { routes: {} }
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
        _nonReactive: {},
      },
      {
        id: '/other',
        routeId: '/other',
        index: 1,
        ssr: undefined,
        _nonReactive: {},
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
        manifest: { routes: {} },
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
        manifest: { routes: {} },
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
