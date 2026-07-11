import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createControlledPromise,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  trimPathRight,
} from '@tanstack/router-core'
import { describe, expect, it, vi } from 'vitest'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

const getHandleRouteUpdate = () => {
  return new Function(`return ${getHandleRouteUpdateCode([])}`)() as (
    routeId: string,
    newRoute: AnyRoute,
  ) => void
}

function createTestHistory(initialEntry = '/') {
  let index = 0
  let location = {
    href: initialEntry,
    pathname: initialEntry,
    search: '',
    hash: '',
    state: { __TSR_index: 0 },
  }
  const subscribers = new Set<(event: any) => void>()

  const update = (href: string, state: any, action: 'PUSH' | 'REPLACE') => {
    if (action === 'PUSH') {
      index++
    }
    location = {
      href,
      pathname: href,
      search: '',
      hash: '',
      state: { ...state, __TSR_index: index },
    }
    for (const subscriber of subscribers) {
      subscriber({ location, action: { type: action } })
    }
  }

  return {
    get location() {
      return location
    },
    get length() {
      return index + 1
    },
    subscribers,
    subscribe: (subscriber: (event: any) => void) => {
      subscribers.add(subscriber)
      return () => subscribers.delete(subscriber)
    },
    push: (href: string, state: any) => update(href, state, 'PUSH'),
    replace: (href: string, state: any) => update(href, state, 'REPLACE'),
    go: () => {},
    back: () => {},
    forward: () => {},
    canGoBack: () => false,
    createHref: (href: string) => href,
    block: () => () => {},
    flush: () => {},
    destroy: () => {},
    notify: () => {},
  }
}

function createTestRouter(routeTree: AnyRoute) {
  return new RouterCore(
    {
      routeTree,
      history: createTestHistory() as any,
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
      history: createTestHistory(initialEntry),
      context,
      isServer: false,
      origin: 'http://localhost',
    } as any,
    getStoreConfig,
  )
}

function withWindowRouter(router: RouterCore<any, any, any, any, any>) {
  const previousWindow = (globalThis as any).window
  ;(globalThis as any).window = { __TSR_ROUTER__: router }

  return () => {
    if (previousWindow) {
      ;(globalThis as any).window = previousWindow
    } else {
      delete (globalThis as any).window
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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        itemRoute.id,
        new BaseRoute({ component: NewComponent } as any),
      )
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        itemRoute.id,
        new BaseRoute({ component: HotComponent } as any),
      )
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(pathlessRoute.id, new BaseRoute({} as any))
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(parentRoute.id, new BaseRoute({} as any))
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        itemRoute.id,
        new BaseRoute({
          params: {
            parse: ({ itemId }: { itemId: string }) => ({ itemId }),
          },
        } as any),
      )
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
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
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(itemRoute.id, newRoute)
    } finally {
      restoreWindow()
    }

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

      const restoreWindow = withWindowRouter(router)
      try {
        getHandleRouteUpdate()(
          hotRoute.id,
          new BaseRoute(
            (removedOption === 'loader' ? { beforeLoad } : { loader }) as any,
          ),
        )
      } finally {
        restoreWindow()
      }

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
    const rootMatch = router.stores.matches.get()[0]!
    const rootStore = router.stores.matchStores.get(rootMatch.id)!

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        rootRoute.id,
        new BaseRootRoute({ context: rootRouteContext } as any),
      )
    } finally {
      restoreWindow()
    }

    expect(rootStore.get().__beforeLoadContext).toBeUndefined()
    expect(rootStore.get().context).toEqual({
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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(childRoute.id, new BaseRoute({} as any))

      // HMR clears the removed child context in both live generations before
      // its invalidation commits. Each rebuild must use its own parent lane;
      // pending context is not allowed to leak into rendered active state.
      expect(
        router.stores.matchStores.get(childId)!.get().context,
      ).toMatchObject({
        rootMode: 'active',
      })
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
    } finally {
      pendingLoader.resolve('pending data')
      await pendingLoad
      restoreWindow()
    }
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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        rootRoute.id,
        new BaseRootRoute({
          context: () => ({ source: 'new' }),
        } as any),
      )
      await router.latestLoadPromise
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        rootRoute.id,
        new BaseRootRoute({
          context: () => ({ source: 'new' }),
        } as any),
      )
      await router.latestLoadPromise
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(hotRoute.id, new BaseRoute({} as any))
      await router.latestLoadPromise
    } finally {
      restoreWindow()
    }

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

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(rootRoute.id, new BaseRootRoute({} as any))
    } finally {
      restoreWindow()
    }

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
