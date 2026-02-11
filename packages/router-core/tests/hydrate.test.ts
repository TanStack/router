import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  notFound,
  rootRouteId,
} from '../src'
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

  it('re-executes context during hydration and preserves parent->child context', async () => {
    const contextOrder: Array<string> = []

    const rootRoute = new BaseRootRoute({
      context: vi.fn(() => {
        contextOrder.push('root')
        return { fromRootContext: 1 }
      }),
    })

    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => 'Index',
      context: vi.fn(({ context }) => {
        contextOrder.push('index')
        expect(context).toEqual({ fromRootContext: 1 })
        return { fromIndexContext: 3 }
      }),
      head: mockHead,
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const history = createMemoryHistory({ initialEntries: ['/'] })
    mockRouter = new RouterCore({ routeTree, history, isServer: true })

    const initialMatches = mockRouter.matchRoutes(mockRouter.state.location)
    const rootMatch = initialMatches.find(
      (m: AnyRouteMatch) => m.routeId === rootRouteId,
    )!
    const indexMatch = initialMatches.find(
      (m: AnyRouteMatch) => m.routeId === indexRoute.id,
    )!

    mockWindow.$_TSR = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        lastMatchId: indexMatch.id,
        matches: [
          {
            i: rootMatch.id,
            b: undefined,
            l: {},
            s: 'success',
            ssr: true,
            u: Date.now(),
          },
          {
            i: indexMatch.id,
            b: { fromServerBeforeLoad: 99 },
            l: {},
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
    } as any

    await hydrate(mockRouter)

    // parent->child order should be preserved
    expect(contextOrder).toEqual(['root', 'index'])

    const hydratedIndexMatch = mockRouter.state.matches[1] as AnyRouteMatch
    expect(hydratedIndexMatch.context).toEqual({
      fromRootContext: 1,
      fromServerBeforeLoad: 99,
      fromIndexContext: 3,
    })
  })

  describe('needsContext flag after hydration', () => {
    function setupHydration({
      rootContext,
      indexContext,
      aboutContext,
      indexBeforeLoadContext,
    }: {
      rootContext?: any
      indexContext?: any
      aboutContext?: any
      indexBeforeLoadContext?: Record<string, unknown>
    }) {
      const rootRoute = new BaseRootRoute({
        context: rootContext,
      })

      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => 'Index',
        context: indexContext,
        head: mockHead,
      })

      const aboutRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        component: () => 'About',
        context: aboutContext,
      })

      const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const router = new RouterCore({ routeTree, history, isServer: true })

      const initialMatches = router.matchRoutes(router.state.location)
      const rootMatch = initialMatches.find(
        (m: AnyRouteMatch) => m.routeId === rootRouteId,
      )!
      const indexMatch = initialMatches.find(
        (m: AnyRouteMatch) => m.routeId === indexRoute.id,
      )!

      mockWindow.$_TSR = {
        router: {
          manifest: { routes: {} },
          dehydratedData: {},
          lastMatchId: indexMatch.id,
          matches: [
            {
              i: rootMatch.id,
              b: undefined,
              l: {},
              s: 'success',
              ssr: true,
              u: Date.now(),
            },
            {
              i: indexMatch.id,
              b: indexBeforeLoadContext ?? {},
              l: {},
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
      } as any

      return { router, rootRoute, indexRoute, aboutRoute }
    }

    it('clears needsContext on all matches after hydration (with context handler)', async () => {
      const rootContextFn = vi.fn(() => ({ rootCtx: 1 }))
      const indexContextFn = vi.fn(() => ({ indexCtx: 2 }))

      const { router } = setupHydration({
        rootContext: rootContextFn,
        indexContext: indexContextFn,
      })

      await hydrate(router)

      for (const match of router.state.matches) {
        expect(match._nonReactive.needsContext).toBe(false)
      }
    })

    it('clears needsContext even when routes have no context handlers', async () => {
      const { router } = setupHydration({})

      await hydrate(router)

      for (const match of router.state.matches) {
        expect(match._nonReactive.needsContext).toBe(false)
      }
    })

    it('clears needsContext for parent and child matches independently', async () => {
      const rootContextFn = vi.fn(() => ({ rootM: 1 }))

      const { router } = setupHydration({
        rootContext: rootContextFn,
        // root has context, index does not
      })

      await hydrate(router)

      const rootMatch = router.state.matches[0]!
      const indexMatch = router.state.matches[1]!

      expect(rootMatch._nonReactive.needsContext).toBe(false)
      expect(indexMatch._nonReactive.needsContext).toBe(false)
    })

    it('clears needsContext after async context during hydration', async () => {
      const rootContextFn = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10))
        return { asyncRootM: 1 }
      })
      const indexContextFn = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10))
        return { asyncIndexM: 2 }
      })

      const { router } = setupHydration({
        rootContext: rootContextFn,
        indexContext: indexContextFn,
      })

      await hydrate(router)

      for (const match of router.state.matches) {
        expect(match._nonReactive.needsContext).toBe(false)
      }

      // Verify the handlers were actually called
      expect(rootContextFn).toHaveBeenCalledTimes(1)
      expect(indexContextFn).toHaveBeenCalledTimes(1)
    })

    it('context is called exactly once during hydration and not re-executed on same-match navigation', async () => {
      const rootContextFn = vi.fn(() => ({ rootM: 1 }))
      const indexContextFn = vi.fn(() => ({ indexM: 2 }))

      const { router } = setupHydration({
        rootContext: rootContextFn,
        indexContext: indexContextFn,
      })

      await hydrate(router)

      expect(rootContextFn).toHaveBeenCalledTimes(1)
      expect(indexContextFn).toHaveBeenCalledTimes(1)

      // Simulate a client-side navigation to the same route (e.g. search param change)
      // by calling router.load() — this is what happens when navigating to the same match
      await router.load()

      // context should NOT have been called again
      expect(rootContextFn).toHaveBeenCalledTimes(1)
      expect(indexContextFn).toHaveBeenCalledTimes(1)
    })

    it('context with revalidate:true is re-executed after router.invalidate() post-hydration', async () => {
      const indexContextFn = vi.fn(() => ({ indexCtx: 1 }))

      const { router } = setupHydration({
        indexContext: { handler: indexContextFn, revalidate: true },
      })

      await hydrate(router)

      expect(indexContextFn).toHaveBeenCalledTimes(1)

      // Invalidate — router.invalidate() internally calls router.load()
      await router.invalidate()

      // context with revalidate:true should be called again because invalidation sets invalid=true
      expect(indexContextFn).toHaveBeenCalledTimes(2)
    })

    it('context (without revalidate) is NOT re-executed after router.invalidate() post-hydration', async () => {
      const indexContextFn = vi.fn(() => ({ indexM: 1 }))

      const { router } = setupHydration({
        indexContext: indexContextFn,
      })

      await hydrate(router)

      expect(indexContextFn).toHaveBeenCalledTimes(1)

      // Invalidate — router.invalidate() internally calls router.load()
      await router.invalidate()

      // context (without revalidate) should NOT be called again
      expect(indexContextFn).toHaveBeenCalledTimes(1)
    })

    it('context is executed for a NEW match after hydration', async () => {
      const aboutContextFn = vi.fn(() => ({ aboutM: 1 }))

      const { router } = setupHydration({
        aboutContext: aboutContextFn,
      })

      await hydrate(router)

      // about route was not matched during hydration
      expect(aboutContextFn).toHaveBeenCalledTimes(0)

      // Navigate to /about (a new match)
      await router.navigate({ to: '/about' })
      await router.load()

      expect(aboutContextFn).toHaveBeenCalledTimes(1)
    })

    it('context from hydration is preserved across same-match reload', async () => {
      const rootContextFn = vi.fn(() => ({ rootM: 10 }))
      const indexContextFn = vi.fn(() => ({ indexM: 30 }))

      const { router } = setupHydration({
        rootContext: rootContextFn,
        indexContext: indexContextFn,
        indexBeforeLoadContext: { fromServer: 99 },
      })

      await hydrate(router)

      const indexMatch = router.state.matches[1]!
      expect(indexMatch.context).toEqual({
        rootM: 10,
        fromServer: 99,
        indexM: 30,
      })

      // After a same-match reload, context should be preserved
      await router.load()

      const reloadedIndexMatch = router.state.matches[1]!
      expect(reloadedIndexMatch.context).toEqual({
        rootM: 10,
        fromServer: 99,
        indexM: 30,
      })
    })

    it('context handler: flags cleared, no double execution', async () => {
      const rootContextFn = vi.fn(() => ({ rM: 1 }))
      const indexContextFn = vi.fn(() => ({ iM: 3 }))

      const { router } = setupHydration({
        rootContext: rootContextFn,
        indexContext: indexContextFn,
      })

      await hydrate(router)

      // All called once during hydration
      expect(rootContextFn).toHaveBeenCalledTimes(1)
      expect(indexContextFn).toHaveBeenCalledTimes(1)

      // All flags cleared
      for (const match of router.state.matches) {
        expect(match._nonReactive.needsContext).toBe(false)
      }

      // Reload — nothing should be re-executed
      await router.load()

      expect(rootContextFn).toHaveBeenCalledTimes(1)
      expect(indexContextFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('dehydrate flag combinations during hydration', () => {
    /**
     * Setup helper for dehydrate-aware hydration tests.
     * Allows context, beforeLoad, and loader lifecycle methods with object form
     * (dehydrate flag), and configurable dehydrated match payloads including m? field.
     */
    function setupDehydrateHydration({
      rootOptions,
      indexOptions,
      dehydratedRoot,
      dehydratedIndex,
      routerDefaultDehydrate,
    }: {
      rootOptions?: {
        context?: any
        beforeLoad?: any
        loader?: any
      }
      indexOptions?: {
        context?: any
        beforeLoad?: any
        loader?: any
      }
      dehydratedRoot: Partial<{
        b: any
        l: any
        m: any
        e: any
        ssr: any
      }>
      dehydratedIndex: Partial<{
        b: any
        l: any
        m: any
        e: any
        ssr: any
      }>
      routerDefaultDehydrate?: {
        beforeLoad?: boolean
        loader?: boolean
        context?: boolean
      }
    }) {
      const rootRoute = new BaseRootRoute({
        context: rootOptions?.context,
        beforeLoad: rootOptions?.beforeLoad,
        loader: rootOptions?.loader,
      })

      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => 'Index',
        context: indexOptions?.context,
        beforeLoad: indexOptions?.beforeLoad,
        loader: indexOptions?.loader,
        head: mockHead,
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const routerOptions: any = {
        routeTree,
        history,
        isServer: true,
      }
      if (routerDefaultDehydrate) {
        routerOptions.defaultDehydrate = routerDefaultDehydrate
      }
      const router = new RouterCore(routerOptions)

      const initialMatches = router.matchRoutes(router.state.location)
      const rootMatch = initialMatches.find(
        (m: AnyRouteMatch) => m.routeId === rootRouteId,
      )!
      const indexMatch = initialMatches.find(
        (m: AnyRouteMatch) => m.routeId === indexRoute.id,
      )!

      mockWindow.$_TSR = {
        router: {
          manifest: { routes: {} },
          dehydratedData: {},
          lastMatchId: indexMatch.id,
          matches: [
            {
              i: rootMatch.id,
              s: 'success' as const,
              ssr: true,
              u: Date.now(),
              ...dehydratedRoot,
            },
            {
              i: indexMatch.id,
              s: 'success' as const,
              ssr: true,
              u: Date.now(),
              ...dehydratedIndex,
            },
          ],
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      } as any

      return { router, rootRoute, indexRoute }
    }

    // --- beforeLoad with dehydrate: false ---

    it('beforeLoad with dehydrate: false — NOT in dehydrated data, re-executed on client', async () => {
      const indexBeforeLoad = vi.fn(() => ({ fromBL: 'client-reexec' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          beforeLoad: { handler: indexBeforeLoad, dehydrate: false },
        },
        dehydratedRoot: {},
        // No `b` field in dehydrated data (dehydrate:false means server didn't include it)
        dehydratedIndex: { l: {} },
      })

      await hydrate(router)

      // Handler re-executed on client
      expect(indexBeforeLoad).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__beforeLoadContext).toEqual({
        fromBL: 'client-reexec',
      })
      expect(indexMatch.context).toEqual(
        expect.objectContaining({ fromBL: 'client-reexec' }),
      )
    })

    it('beforeLoad with dehydrate: true (default) — in dehydrated data, NOT re-executed on client', async () => {
      const indexBeforeLoad = vi.fn(() => ({
        fromBL: 'should-not-run',
      }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          // function form = default dehydrate: true for beforeLoad
          beforeLoad: indexBeforeLoad,
        },
        dehydratedRoot: {},
        // Server provided `b` field (dehydrate:true means it's dehydrated)
        dehydratedIndex: {
          b: { fromBL: 'from-server' },
          l: {},
        },
      })

      await hydrate(router)

      // Handler NOT re-executed (data came from wire)
      expect(indexBeforeLoad).not.toHaveBeenCalled()

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__beforeLoadContext).toEqual({ fromBL: 'from-server' })
      expect(indexMatch.context).toEqual(
        expect.objectContaining({ fromBL: 'from-server' }),
      )
    })

    // --- loader with dehydrate: false ---

    it('loader with dehydrate: false — NOT in dehydrated data, re-executed on client', async () => {
      const indexLoader = vi.fn(() => ({ loaderVal: 'client-reexec' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          loader: { handler: indexLoader, dehydrate: false },
        },
        dehydratedRoot: {},
        // No `l` field with data (dehydrate:false means server didn't include it)
        dehydratedIndex: { b: {} },
      })

      await hydrate(router)

      // Handler re-executed on client (in parallel phase)
      expect(indexLoader).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.loaderData).toEqual({ loaderVal: 'client-reexec' })
    })

    it('loader with dehydrate: true (default) — in dehydrated data, NOT re-executed on client', async () => {
      const indexLoader = vi.fn(() => ({
        loaderVal: 'should-not-run',
      }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          // function form = default dehydrate: true for loader
          loader: indexLoader,
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          b: {},
          l: { loaderVal: 'from-server' },
        },
      })

      await hydrate(router)

      // Handler NOT re-executed (data came from wire)
      expect(indexLoader).not.toHaveBeenCalled()

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.loaderData).toEqual({ loaderVal: 'from-server' })
    })

    // --- context with dehydrate: true ---

    it('context with dehydrate: true — IS in dehydrated data, NOT re-executed on client', async () => {
      const indexContextFn = vi.fn(() => ({
        fromCtx: 'should-not-run',
      }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: indexContextFn, dehydrate: true },
        },
        dehydratedRoot: {},
        // Server provided `m` field (dehydrate:true means it's dehydrated)
        dehydratedIndex: {
          m: { fromCtx: 'from-server' },
          l: {},
        },
      })

      await hydrate(router)

      // Handler NOT re-executed (data came from wire)
      expect(indexContextFn).not.toHaveBeenCalled()

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ fromCtx: 'from-server' })
      expect(indexMatch.context).toEqual(
        expect.objectContaining({ fromCtx: 'from-server' }),
      )
    })

    it('context with dehydrate: false (default) — NOT in dehydrated data, re-executed on client', async () => {
      const indexContextFn = vi.fn(() => ({
        fromCtx: 'client-reexec',
      }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          // function form = default dehydrate: false for context
          context: indexContextFn,
        },
        dehydratedRoot: {},
        // No `m` field (dehydrate:false means server didn't include it)
        dehydratedIndex: { l: {} },
      })

      await hydrate(router)

      // Handler re-executed on client
      expect(indexContextFn).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ fromCtx: 'client-reexec' })
      expect(indexMatch.context).toEqual(
        expect.objectContaining({ fromCtx: 'client-reexec' }),
      )
    })

    // --- needsContext flags with dehydrate combinations ---

    it('needsContext cleared regardless of dehydrate flag (dehydrate: true)', async () => {
      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: () => ({ v: 1 }), dehydrate: true },
        },
        dehydratedRoot: {},
        dehydratedIndex: { m: { v: 1 }, l: {} },
      })

      await hydrate(router)

      for (const match of router.state.matches) {
        expect(match._nonReactive.needsContext).toBe(false)
      }
    })

    it('needsContext cleared regardless of dehydrate flag (dehydrate: false)', async () => {
      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: () => ({ v: 1 }), dehydrate: false },
        },
        dehydratedRoot: {},
        dehydratedIndex: { l: {} },
      })

      await hydrate(router)

      for (const match of router.state.matches) {
        expect(match._nonReactive.needsContext).toBe(false)
      }
    })

    // --- Mixed dehydrate: inverted from defaults ---

    it('mixed dehydrate: beforeLoad=false, loader=true, context=true', async () => {
      const indexBeforeLoad = vi.fn(() => ({ bl: 'reexec' }))
      const indexLoader = vi.fn(() => ({ ld: 'should-not-run' }))
      const indexContextFn = vi.fn(() => ({ ctx: 'should-not-run' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          beforeLoad: { handler: indexBeforeLoad, dehydrate: false },
          loader: { handler: indexLoader, dehydrate: true },
          context: { handler: indexContextFn, dehydrate: true },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          // beforeLoad NOT included (dehydrate:false)
          // loader IS included (dehydrate:true)
          l: { ld: 'from-server' },
          // context IS included (dehydrate:true)
          m: { ctx: 'from-server' },
        },
      })

      await hydrate(router)

      // beforeLoad was re-executed (dehydrate:false)
      expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
      // loader was NOT re-executed (dehydrate:true, data from wire)
      expect(indexLoader).not.toHaveBeenCalled()
      // context was NOT re-executed (dehydrate:true, data from wire)
      expect(indexContextFn).not.toHaveBeenCalled()

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ ctx: 'from-server' })
      expect(indexMatch.__beforeLoadContext).toEqual({ bl: 'reexec' })
      expect(indexMatch.loaderData).toEqual({ ld: 'from-server' })
      expect(indexMatch.context).toEqual(
        expect.objectContaining({
          ctx: 'from-server',
          bl: 'reexec',
        }),
      )
    })

    // --- All dehydrate: true (everything from wire) ---

    it('all dehydrate: true — no handlers re-executed, all data from wire', async () => {
      const indexContextFn = vi.fn(() => ({ ctx: 'nope' }))
      const indexBeforeLoad = vi.fn(() => ({ bl: 'nope' }))
      const indexLoader = vi.fn(() => ({ ld: 'nope' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: indexContextFn, dehydrate: true },
          beforeLoad: { handler: indexBeforeLoad, dehydrate: true },
          loader: { handler: indexLoader, dehydrate: true },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          b: { bl: 'server' },
          l: { ld: 'server' },
          m: { ctx: 'server' },
        },
      })

      await hydrate(router)

      expect(indexContextFn).not.toHaveBeenCalled()
      expect(indexBeforeLoad).not.toHaveBeenCalled()
      expect(indexLoader).not.toHaveBeenCalled()

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ ctx: 'server' })
      expect(indexMatch.__beforeLoadContext).toEqual({ bl: 'server' })
      expect(indexMatch.loaderData).toEqual({ ld: 'server' })
    })

    // --- All dehydrate: false (everything re-executed) ---

    it('all dehydrate: false — all handlers re-executed, no data from wire', async () => {
      const indexContextFn = vi.fn(() => ({ ctx: 'reexec' }))
      const indexBeforeLoad = vi.fn(() => ({ bl: 'reexec' }))
      const indexLoader = vi.fn(() => ({ ld: 'reexec' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: indexContextFn, dehydrate: false },
          beforeLoad: { handler: indexBeforeLoad, dehydrate: false },
          loader: { handler: indexLoader, dehydrate: false },
        },
        dehydratedRoot: {},
        // No b/l/m — nothing serialized
        dehydratedIndex: {},
      })

      await hydrate(router)

      expect(indexContextFn).toHaveBeenCalledTimes(1)
      expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
      expect(indexLoader).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ ctx: 'reexec' })
      expect(indexMatch.__beforeLoadContext).toEqual({ bl: 'reexec' })
      expect(indexMatch.loaderData).toEqual({ ld: 'reexec' })
    })

    // --- Context chain integrity with mixed dehydrate across parent-child ---

    it('parent-child mixed dehydrate: parent beforeLoad=false, child context=true — context chain intact', async () => {
      const rootBeforeLoad = vi.fn(() => ({
        rootBL: 'root-client-reexec',
      }))
      const rootContextFn = vi.fn(() => ({
        rootCtx: 'root-client-reexec',
      }))
      const indexContextFn = vi.fn(() => ({
        indexCtx: 'should-not-run',
      }))

      const { router } = setupDehydrateHydration({
        rootOptions: {
          beforeLoad: { handler: rootBeforeLoad, dehydrate: false },
          context: rootContextFn, // function form — default dehydrate: false for context
        },
        indexOptions: {
          context: { handler: indexContextFn, dehydrate: true },
        },
        dehydratedRoot: {
          // No `b` — beforeLoad not serialized
          // No `m` — context not serialized (default)
        },
        dehydratedIndex: {
          // `m` IS present — context serialized
          m: { indexCtx: 'from-server' },
          l: {},
        },
      })

      await hydrate(router)

      // Root handlers re-executed (dehydrate:false)
      expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
      expect(rootContextFn).toHaveBeenCalledTimes(1)

      // Index context NOT re-executed (dehydrate:true, data from wire)
      expect(indexContextFn).not.toHaveBeenCalled()

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ indexCtx: 'from-server' })

      // The context chain should contain root's re-executed context + index's wire context
      expect(indexMatch.context).toEqual(
        expect.objectContaining({
          rootBL: 'root-client-reexec',
          rootCtx: 'root-client-reexec',
          indexCtx: 'from-server',
        }),
      )
    })

    // --- Router-level defaultDehydrate overrides ---

    it('router-level defaultDehydrate overrides builtin defaults', async () => {
      // Override: context defaults to dehydrate:true (builtin is false)
      // Override: beforeLoad defaults to dehydrate:false (builtin is true)
      const indexContextFn = vi.fn(() => ({ ctx: 'should-not-run' }))
      const indexBeforeLoad = vi.fn(() => ({ bl: 'reexec' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: indexContextFn, // function form — router default: true
          beforeLoad: indexBeforeLoad, // function form — router default: false
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          // context IS in payload because router default is true
          m: { ctx: 'from-server' },
          // beforeLoad NOT in payload because router default is false
          l: {},
        },
        routerDefaultDehydrate: {
          context: true,
          beforeLoad: false,
        },
      })

      await hydrate(router)

      // context NOT re-executed (router default: dehydrate true)
      expect(indexContextFn).not.toHaveBeenCalled()
      // beforeLoad IS re-executed (router default: dehydrate false)
      expect(indexBeforeLoad).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ ctx: 'from-server' })
      expect(indexMatch.__beforeLoadContext).toEqual({ bl: 'reexec' })
    })

    // --- method-level dehydrate overrides router-level defaults ---

    it('method-level dehydrate overrides router-level defaults', async () => {
      // Router default: context=true, but method says dehydrate:false
      const indexContextFn = vi.fn(() => ({ ctx: 'reexec' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: indexContextFn, dehydrate: false },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          // No `m` — method-level dehydrate:false wins
          l: {},
        },
        routerDefaultDehydrate: {
          context: true, // would normally prevent re-execution
        },
      })

      await hydrate(router)

      // Method-level dehydrate:false wins — handler IS re-executed
      expect(indexContextFn).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__routeContext).toEqual({ ctx: 'reexec' })
    })

    // --- loader handler sees accumulated context from earlier phases ---

    it('re-executed loader sees context from serialized context and re-executed beforeLoad', async () => {
      let loaderCtxCapture: any = null

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: () => ({ ctx: 'wire' }), dehydrate: true },
          beforeLoad: {
            handler: () => ({ bl: 'client' }),
            dehydrate: false,
          },
          loader: {
            handler: ({ context }: { context: any }) => {
              loaderCtxCapture = context
              return { ld: 'reexec' }
            },
            dehydrate: false,
          },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          m: { ctx: 'wire' },
          // No `b` — beforeLoad not serialized
        },
      })

      await hydrate(router)

      expect(loaderCtxCapture).toEqual(
        expect.objectContaining({
          ctx: 'wire',
          bl: 'client',
        }),
      )

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.loaderData).toEqual({ ld: 'reexec' })
    })

    // --- loader sees full context chain from context + beforeLoad ---

    it('re-executed loader gets full context from context + beforeLoad', async () => {
      let loaderCtxCapture: any = null

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: {
            handler: () => ({ ctx: 'from-wire' }),
            dehydrate: true,
          },
          beforeLoad: {
            handler: () => ({ bl: 'from-client' }),
            dehydrate: false,
          },
          loader: {
            handler: ({ context }: { context: any }) => {
              loaderCtxCapture = context
              return { ld: 'reexec' }
            },
            dehydrate: false,
          },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          m: { ctx: 'from-wire' },
        },
      })

      await hydrate(router)

      expect(loaderCtxCapture).toEqual(
        expect.objectContaining({
          ctx: 'from-wire',
          bl: 'from-client',
        }),
      )

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.loaderData).toEqual({ ld: 'reexec' })
    })

    // --- Object form without explicit dehydrate uses builtin defaults ---

    it('object form without dehydrate property uses builtin defaults', async () => {
      // beforeLoad object form without dehydrate → builtin default: true → NOT re-executed
      const indexBeforeLoad = vi.fn(() => ({ bl: 'should-not-run' }))
      // context object form without dehydrate → builtin default: false → re-executed
      const indexContextFn = vi.fn(() => ({ ctx: 'reexec' }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          beforeLoad: { handler: indexBeforeLoad },
          context: { handler: indexContextFn },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          b: { bl: 'from-server' },
          // No `m` — context default is false
          l: {},
        },
      })

      await hydrate(router)

      // beforeLoad NOT re-executed (builtin default: true → from wire)
      expect(indexBeforeLoad).not.toHaveBeenCalled()
      // context IS re-executed (builtin default: false → not dehydrated)
      expect(indexContextFn).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.__beforeLoadContext).toEqual({ bl: 'from-server' })
      expect(indexMatch.__routeContext).toEqual({ ctx: 'reexec' })
    })

    // --- Multiple loaders re-execute in parallel ---

    it('multiple loader re-executions run in parallel (not sequentially)', async () => {
      const executionLog: Array<string> = []

      const rootLoader = vi.fn(async () => {
        executionLog.push('root-loader-start')
        await new Promise((r) => setTimeout(r, 50))
        executionLog.push('root-loader-end')
        return { rootLd: 1 }
      })
      const indexLoader = vi.fn(async () => {
        executionLog.push('index-loader-start')
        await new Promise((r) => setTimeout(r, 50))
        executionLog.push('index-loader-end')
        return { indexLd: 2 }
      })

      const { router } = setupDehydrateHydration({
        rootOptions: {
          loader: { handler: rootLoader, dehydrate: false },
        },
        indexOptions: {
          loader: { handler: indexLoader, dehydrate: false },
        },
        dehydratedRoot: {},
        dehydratedIndex: {},
      })

      await hydrate(router)

      expect(rootLoader).toHaveBeenCalledTimes(1)
      expect(indexLoader).toHaveBeenCalledTimes(1)

      // Both loaders should start before either ends (parallel execution)
      const rootStartIdx = executionLog.indexOf('root-loader-start')
      const indexStartIdx = executionLog.indexOf('index-loader-start')
      const rootEndIdx = executionLog.indexOf('root-loader-end')
      const indexEndIdx = executionLog.indexOf('index-loader-end')

      // Both started before either ended
      expect(rootStartIdx).toBeLessThan(rootEndIdx)
      expect(indexStartIdx).toBeLessThan(indexEndIdx)
      expect(rootStartIdx).toBeLessThan(indexEndIdx)
      expect(indexStartIdx).toBeLessThan(rootEndIdx)

      const rootMatch = router.state.matches[0] as AnyRouteMatch
      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(rootMatch.loaderData).toEqual({ rootLd: 1 })
      expect(indexMatch.loaderData).toEqual({ indexLd: 2 })
    })

    // --- dehydrate:false handler throws during hydration ---

    it('beforeLoad with dehydrate:false that throws sets match.error and re-throws', async () => {
      const thrownError = new Error('beforeLoad boom')
      const indexBeforeLoad = vi.fn(() => {
        throw thrownError
      })

      const { router } = setupDehydrateHydration({
        indexOptions: {
          beforeLoad: { handler: indexBeforeLoad, dehydrate: false },
        },
        dehydratedRoot: {},
        dehydratedIndex: { l: {} },
      })

      await expect(hydrate(router)).rejects.toThrow('beforeLoad boom')

      expect(indexBeforeLoad).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.error).toBe(thrownError)
    })

    it('context with dehydrate:false that throws sets match.error and re-throws', async () => {
      const thrownError = new Error('context boom')
      const indexContextFn = vi.fn(() => {
        throw thrownError
      })

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: { handler: indexContextFn, dehydrate: false },
        },
        dehydratedRoot: {},
        dehydratedIndex: { l: {} },
      })

      await expect(hydrate(router)).rejects.toThrow('context boom')

      expect(indexContextFn).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.error).toBe(thrownError)
    })

    it('loader with dehydrate:false that throws captures error on match (no re-throw)', async () => {
      const thrownError = new Error('loader boom')
      const indexLoader = vi.fn(() => {
        throw thrownError
      })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { router } = setupDehydrateHydration({
        indexOptions: {
          loader: { handler: indexLoader, dehydrate: false },
        },
        dehydratedRoot: {},
        dehydratedIndex: {},
      })

      // Should NOT reject — loader errors are captured, not re-thrown
      await hydrate(router)

      expect(indexLoader).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect(indexMatch.error).toBe(thrownError)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error during hydration loader re-execution'),
        thrownError,
      )

      consoleSpy.mockRestore()
    })

    it('dehydrate fn + hydrate fn: wire payload is transformed then reconstructed', async () => {
      const ctxHydrate = vi.fn(({ data }: { data: { iso: string } }) => ({
        dt: new Date(data.iso),
      }))
      const blHydrate = vi.fn(({ data }: { data: { iso: string } }) => ({
        dt: new Date(data.iso),
      }))
      const ldHydrate = vi.fn(({ data }: { data: { iso: string } }) => ({
        dt: new Date(data.iso),
      }))

      const { router } = setupDehydrateHydration({
        indexOptions: {
          context: {
            handler: () => ({ dt: new Date('1900-01-01T00:00:00.000Z') }),
            dehydrate: ({ data }: { data: { dt: Date } }) => ({
              iso: data.dt.toISOString(),
            }),
            hydrate: ctxHydrate,
          },
          beforeLoad: {
            handler: () => ({ dt: new Date('1900-01-01T00:00:00.000Z') }),
            dehydrate: ({ data }: { data: { dt: Date } }) => ({
              iso: data.dt.toISOString(),
            }),
            hydrate: blHydrate,
          },
          loader: {
            handler: () => ({ dt: new Date('1900-01-01T00:00:00.000Z') }),
            dehydrate: ({ data }: { data: { dt: Date } }) => ({
              iso: data.dt.toISOString(),
            }),
            hydrate: ldHydrate,
          },
        },
        dehydratedRoot: {},
        dehydratedIndex: {
          m: { iso: '2020-01-01T00:00:00.000Z' },
          b: { iso: '2021-01-01T00:00:00.000Z' },
          l: { iso: '2022-01-01T00:00:00.000Z' },
        },
      })

      await hydrate(router)

      expect(ctxHydrate).toHaveBeenCalledTimes(1)
      expect(blHydrate).toHaveBeenCalledTimes(1)
      expect(ldHydrate).toHaveBeenCalledTimes(1)

      const indexMatch = router.state.matches[1] as AnyRouteMatch
      expect((indexMatch.__routeContext as any).dt).toBeInstanceOf(Date)
      expect(
        ((indexMatch.__routeContext as any).dt as Date).toISOString(),
      ).toBe('2020-01-01T00:00:00.000Z')
      expect((indexMatch.__beforeLoadContext as any).dt).toBeInstanceOf(Date)
      expect(
        ((indexMatch.__beforeLoadContext as any).dt as Date).toISOString(),
      ).toBe('2021-01-01T00:00:00.000Z')
      expect((indexMatch.loaderData as any).dt).toBeInstanceOf(Date)
      expect(((indexMatch.loaderData as any).dt as Date).toISOString()).toBe(
        '2022-01-01T00:00:00.000Z',
      )
    })
  })
})
