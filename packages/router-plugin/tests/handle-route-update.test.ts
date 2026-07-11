import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createControlledPromise,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  trimPathRight,
} from '@tanstack/router-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
})

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

const getGeneratedHandleRouteUpdate = () => {
  return new Function(`return ${getHandleRouteUpdateCode([])}`)() as (
    routeId: string,
    newRoute: AnyRoute,
  ) => void
}

function createTestRouter(routeTree: AnyRoute) {
  return new RouterCore(
    {
      routeTree,
      history: createMemoryHistory(),
      isServer: true,
    },
    getStoreConfig,
  )
}

function createClientTestRouter(
  routeTree: AnyRoute,
  initialEntry: string,
  context: Record<string, unknown> = {},
) {
  return new RouterCore(
    {
      routeTree,
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      context,
      isServer: false,
      origin: 'http://localhost',
    } as any,
    getStoreConfig,
  )
}

function runHandleRouteUpdate(
  router: RouterCore<any, any, any, any, any>,
  routeId: string,
  newRoute: AnyRoute,
) {
  const previousWindow = (globalThis as any).window
  ;(globalThis as any).window = {
    ...previousWindow,
    __TSR_ROUTER__: router,
  }

  try {
    getGeneratedHandleRouteUpdate()(routeId, newRoute)
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as any).window
    } else {
      ;(globalThis as any).window = previousWindow
    }
  }
}

function getProcessedTreeRouteForPath(
  router: RouterCore<any, any, any, any, any>,
  path: string,
) {
  return router.buildRouteTree().routesByPath[path]?.id
}

describe('handleRouteUpdate', () => {
  it('does not let a pre-HMR component preload hide a failed post-HMR generation', async () => {
    const oldPreload = createControlledPromise<void>()
    const firstNewPreload = createControlledPromise<void>()
    const OldComponent = Object.assign(() => null, {
      preload: () => oldPreload,
    })
    const newPreload = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstNewPreload)
      .mockResolvedValueOnce()
    const NewComponent = Object.assign(() => null, {
      preload: newPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items',
      component: OldComponent,
    })
    const router = createTestRouter(rootRoute.addChildren([itemRoute]))

    const oldLoad = router.loadRouteChunk(itemRoute)!

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({ component: NewComponent } as any),
    )

    const newLoad = router.loadRouteChunk(itemRoute)!
    expect(newPreload).toHaveBeenCalledTimes(1)

    oldPreload.resolve()
    await oldLoad

    firstNewPreload.reject(new Error('new chunk failed'))
    await expect(newLoad).rejects.toThrow('new chunk failed')

    await router.loadRouteChunk(itemRoute)
    expect(newPreload).toHaveBeenCalledTimes(2)
  })

  it('does not let a pre-HMR lazy result overwrite post-HMR route options', async () => {
    const oldLazy = createControlledPromise<any>()
    const newLazy = createControlledPromise<any>()
    const InitialComponent = () => null
    const HotComponent = () => null
    const StaleLazyComponent = () => null
    const currentComponentPreload = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('current component failed'))
    const CurrentLazyComponent = Object.assign(() => null, {
      preload: currentComponentPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items',
      component: InitialComponent,
    })
    itemRoute.lazyFn = vi
      .fn()
      .mockReturnValueOnce(oldLazy)
      .mockReturnValueOnce(newLazy)
    const router = createTestRouter(rootRoute.addChildren([itemRoute]))

    const oldLoad = router.loadRouteChunk(itemRoute)!

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({ component: HotComponent } as any),
    )

    const newLoad = router.loadRouteChunk(itemRoute)!

    newLazy.resolve({
      options: { id: itemRoute.id, component: CurrentLazyComponent },
    })
    await expect(newLoad).rejects.toThrow('current component failed')
    expect(itemRoute.options.component).toBe(CurrentLazyComponent)

    oldLazy.resolve({
      options: { id: itemRoute.id, component: StaleLazyComponent },
    })
    await expect(oldLoad).resolves.toBeUndefined()
    expect(itemRoute.options.component).toBe(CurrentLazyComponent)
    expect(currentComponentPreload).toHaveBeenCalledTimes(1)
  })

  it('keeps routesByPath pointed at an index route when a pathless layout updates', () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/livestock/$farmId/medicine',
    })
    const pathlessRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      id: '_form',
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => pathlessRoute,
      path: 'new',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([
        pathlessRoute.addChildren([newRoute]),
        indexRoute,
      ]),
    ])
    const router = createTestRouter(routeTree)
    const key = trimPathRight(indexRoute.fullPath)

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)

    runHandleRouteUpdate(router, pathlessRoute.id, new BaseRoute({} as any))

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)
    expect(router.routesByPath[key]?.id).toBe(
      getProcessedTreeRouteForPath(router, key),
    )
  })

  it('keeps an index route winning the trimmed path key when its parent updates', () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/path',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([indexRoute]),
    ])
    const router = createTestRouter(routeTree)
    const key = trimPathRight(indexRoute.fullPath)

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)

    runHandleRouteUpdate(router, parentRoute.id, new BaseRoute({} as any))

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)
    expect(router.routesByPath[key]?.id).toBe(
      getProcessedTreeRouteForPath(router, key),
    )
  })

  it('refreshes matching data when params.parse changes', () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => {
          return /^\d+$/.test(itemId) ? { itemId } : false
        },
      },
    })
    const routeTree = rootRoute.addChildren([itemRoute])
    const router = createTestRouter(routeTree)

    expect(router.getMatchedRoutes('/items/abc').foundRoute?.id).toBeUndefined()

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({
        params: {
          parse: ({ itemId }: { itemId: string }) => ({ itemId }),
        },
      } as any),
    )

    expect(router.getMatchedRoutes('/items/abc').foundRoute?.id).toBe(
      itemRoute.id,
    )
  })

  it('refreshes active parsed params when a hot parser keeps the same match id', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => ({
          itemId,
          parserVersion: 'old',
        }),
      },
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([itemRoute]),
      '/items/abc',
    )

    await router.load()
    expect(router.stores.matches.get()[1]!.params).toMatchObject({
      itemId: 'abc',
      parserVersion: 'old',
    })

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({
        params: {
          parse: ({ itemId }: { itemId: string }) => ({
            itemId,
            parserVersion: 'new',
          }),
        },
      } as any),
    )
    await router.latestLoadPromise

    expect(router.stores.matches.get()[1]!.params).toMatchObject({
      itemId: 'abc',
      parserVersion: 'new',
    })
  })

  it('hydrates the hot module route export with generated route tree state', () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$itemId',
    })
    const routeTree = rootRoute.addChildren([itemRoute])
    const router = createTestRouter(routeTree)
    const newRoute = new BaseRoute({} as any)

    expect((newRoute as any).to).toBeUndefined()

    runHandleRouteUpdate(router, itemRoute.id, newRoute)

    expect(newRoute.id).toBe(itemRoute.id)
    expect(newRoute.path).toBe(itemRoute.path)
    expect(newRoute.fullPath).toBe(itemRoute.fullPath)
    expect(newRoute.to).toBe(itemRoute.to)
    expect((newRoute as any).parentRoute).toBe(rootRoute)
    expect((newRoute as any).options).toBe((itemRoute as any).options)
  })

  it.each(['loader', 'beforeLoad'] as const)(
    'evicts a cached hot-route match when %s is removed',
    async (removedOption) => {
      const beforeLoad = () => ({ hot: true })
      const loader = () => 'hot data'
      const rootRoute = new BaseRootRoute({})
      const hotRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/hot',
        beforeLoad,
        loader,
        gcTime: Infinity,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      const router = createClientTestRouter(
        rootRoute.addChildren([hotRoute, otherRoute]),
        '/hot',
      )

      await router.load()
      await router.navigate({ to: '/other' })

      const cachedMatch = router.stores.cachedMatches
        .get()
        .find((match) => match.routeId === hotRoute.id)!
      expect(cachedMatch).toBeDefined()
      // Leaving the route already cancels the old owned pass controller. HMR
      // only needs to ensure the now-incompatible cache entry is discarded.
      expect(cachedMatch.abortController.signal.aborted).toBe(true)

      runHandleRouteUpdate(
        router,
        hotRoute.id,
        new BaseRoute(
          (removedOption === 'loader' ? { beforeLoad } : { loader }) as any,
        ),
      )

      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === hotRoute.id),
      ).toBe(false)
    },
  )

  it('rebuilds root context from router and route context when beforeLoad is removed', async () => {
    const rootRouteContext = () => ({ rootRouteContext: true })
    const rootRoute = new BaseRootRoute({
      context: rootRouteContext,
      beforeLoad: () => ({ rootBeforeLoad: true }),
    })
    const router = createClientTestRouter(rootRoute, '/', {
      routerContext: true,
    })

    await router.load()

    runHandleRouteUpdate(
      router,
      rootRoute.id,
      new BaseRootRoute({ context: rootRouteContext } as any),
    )

    expect(router.stores.matches.get()[0]!.context).toEqual({
      routerContext: true,
      rootRouteContext: true,
    })
  })

  it('rebuilds removed beforeLoad context within each live lane', async () => {
    const pendingLoader = createControlledPromise<string>()
    let mode = 'active'
    const rootRoute = new BaseRootRoute({
      loaderDeps: () => ({ mode }),
      context: ({ deps }) => ({ rootMode: deps.mode }),
      loader: ({ deps }) =>
        deps.mode === 'pending' ? pendingLoader : 'active data',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      beforeLoad: () => ({ childBeforeLoad: true }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([childRoute]),
      '/child',
    )

    await router.load()
    const childId = router.stores.matches.get()[1]!.id
    expect(router.stores.matchStores.get(childId)!.get().context).toMatchObject(
      {
        rootMode: 'active',
        childBeforeLoad: true,
      },
    )

    // A changed parent loader-deps key creates a distinct pending parent while
    // the passive child keeps the same match id in both pools.
    mode = 'pending'
    const pendingLoad = router.load()
    await vi.waitFor(() => {
      expect(router.stores.pendingMatchStores.has(childId)).toBe(true)
      expect(
        router.stores.pendingMatchStores.get(childId)!.get().context,
      ).toMatchObject({
        rootMode: 'pending',
        childBeforeLoad: true,
      })
    })

    testCleanups.push(async () => {
      pendingLoader.resolve('pending data')
      await pendingLoad
    })
    runHandleRouteUpdate(router, childRoute.id, new BaseRoute({} as any))

    // HMR clears the removed child context in both live generations before
    // its invalidation commits. Each rebuild must use its own parent lane;
    // pending context is not allowed to leak into rendered active state.
    expect(router.stores.matchStores.get(childId)!.get().context).toMatchObject(
      {
        rootMode: 'active',
      },
    )
    expect(
      router.stores.matchStores.get(childId)!.get().context,
    ).not.toHaveProperty('childBeforeLoad')
    expect(
      router.stores.pendingMatchStores.get(childId)!.get().context,
    ).toMatchObject({
      rootMode: 'pending',
    })
    expect(
      router.stores.pendingMatchStores.get(childId)!.get().context,
    ).not.toHaveProperty('childBeforeLoad')
  })

  it('recomputes route context when the context option changes', async () => {
    const rootRoute = new BaseRootRoute({
      context: () => ({ source: 'old' }),
    })
    const router = createClientTestRouter(rootRoute, '/', {
      routerContext: true,
    })

    await router.load()
    expect(router.stores.matches.get()[0]!.context).toEqual({
      routerContext: true,
      source: 'old',
    })

    runHandleRouteUpdate(
      router,
      rootRoute.id,
      new BaseRootRoute({
        context: () => ({ source: 'new' }),
      } as any),
    )
    await router.latestLoadPromise

    expect(router.stores.matches.get()[0]!.context).toEqual({
      routerContext: true,
      source: 'new',
    })
  })

  it('recomputes descendant route context after a parent context hot update', async () => {
    const rootRoute = new BaseRootRoute({
      context: () => ({ source: 'old' }),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      context: ({ context }) => ({
        derived: `child-${(context as any).source}`,
      }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([childRoute]),
      '/child',
    )

    await router.load()
    expect(router.stores.matches.get()[1]!.context).toMatchObject({
      source: 'old',
      derived: 'child-old',
    })

    runHandleRouteUpdate(
      router,
      rootRoute.id,
      new BaseRootRoute({
        context: () => ({ source: 'new' }),
      } as any),
    )
    await router.latestLoadPromise

    expect(router.stores.matches.get()[1]!.context).toMatchObject({
      source: 'new',
      derived: 'child-new',
    })
  })

  it('clears projected client assets when head and scripts are removed', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hot',
      head: () => ({
        meta: [{ title: 'hot title' }],
        links: [{ rel: 'stylesheet', href: '/hot.css' }],
        scripts: [{ src: '/hot-head.js' }],
        styles: [{ children: '.hot {}' }],
      }),
      scripts: () => [{ src: '/hot-body.js' }],
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([hotRoute]),
      '/hot',
    )

    await router.load()
    expect(router.stores.matches.get()[1]).toMatchObject({
      meta: [{ title: 'hot title' }],
      links: [{ rel: 'stylesheet', href: '/hot.css' }],
      headScripts: [{ src: '/hot-head.js' }],
      scripts: [{ src: '/hot-body.js' }],
      styles: [{ children: '.hot {}' }],
    })

    runHandleRouteUpdate(router, hotRoute.id, new BaseRoute({} as any))
    await router.latestLoadPromise

    const match = router.stores.matches.get()[1]!
    expect(match.meta).toBeUndefined()
    expect(match.links).toBeUndefined()
    expect(match.headScripts).toBeUndefined()
    expect(match.scripts).toBeUndefined()
    expect(match.styles).toBeUndefined()
  })

  it('clears removed projected assets from active and pending generations with the same id', async () => {
    const loaderGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({
      head: () => ({ meta: [{ title: 'hot root' }] }),
      scripts: () => [{ src: '/hot-root.js' }],
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const slowRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/slow',
      loader: () => loaderGate,
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([indexRoute, slowRoute]),
      '/',
    )

    await router.load()
    const navigation = router.navigate({ to: '/slow' })
    await vi.waitFor(() => {
      expect(router.stores.pendingMatches.get()).toHaveLength(2)
    })

    const rootId = router.stores.matches.get()[0]!.id
    expect(router.stores.pendingMatches.get()[0]!.id).toBe(rootId)

    runHandleRouteUpdate(router, rootRoute.id, new BaseRootRoute({} as any))

    expect(router.stores.matchStores.get(rootId)!.get().meta).toBeUndefined()
    expect(router.stores.matchStores.get(rootId)!.get().scripts).toBeUndefined()
    expect(
      router.stores.pendingMatchStores.get(rootId)!.get().meta,
    ).toBeUndefined()
    expect(
      router.stores.pendingMatchStores.get(rootId)!.get().scripts,
    ).toBeUndefined()

    loaderGate.resolve()
    await navigation
  })
})
