// @vitest-environment jsdom

import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  trimPathRight,
} from '@tanstack/router-core'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

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

function asAnyRoute<TRoute>(route: TRoute): TRoute & AnyRoute {
  return route as unknown as TRoute & AnyRoute
}

function createTestHistory() {
  const location = {
    href: '/',
    pathname: '/',
    search: '',
    hash: '',
    state: { __TSR_index: 0 },
  }

  return {
    location,
    length: 1,
    subscribers: new Set(),
    subscribe: () => () => {},
    push: () => {},
    replace: () => {},
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

function createTestRouter<TRouteTree>(routeTree: TRouteTree) {
  return new RouterCore(
    {
      routeTree: asAnyRoute(routeTree),
      history: createTestHistory() as any,
      isServer: true,
    },
    getStoreConfig,
  )
}

function createClientTestRouter<TRouteTree>(
  routeTree: TRouteTree,
  initialEntry: string,
) {
  return new RouterCore(
    {
      routeTree: asAnyRoute(routeTree),
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      isServer: false,
      origin: 'http://localhost',
    },
    getStoreConfig,
  )
}

function withWindowRouter(router: RouterCore<any, any, any, any, any>) {
  const testWindow = globalThis.window as any
  const hadOwnRouter = Object.prototype.hasOwnProperty.call(
    testWindow,
    '__TSR_ROUTER__',
  )
  const previousRouter = testWindow.__TSR_ROUTER__
  testWindow.__TSR_ROUTER__ = router

  return () => {
    if (hadOwnRouter) {
      testWindow.__TSR_ROUTER__ = previousRouter
    } else {
      delete testWindow.__TSR_ROUTER__
    }
  }
}

function runHandleRouteUpdate<TRoute>(
  router: RouterCore<any, any, any, any, any>,
  routeId: string,
  newRoute: TRoute,
) {
  const restoreWindow = withWindowRouter(router)
  try {
    getHandleRouteUpdate()(routeId, asAnyRoute(newRoute))
  } finally {
    restoreWindow()
  }
}

function getProcessedTreeRouteForPath(
  router: RouterCore<any, any, any, any, any>,
  path: string,
) {
  return router.buildRouteTree().routesByPath[path]?.id
}

describe('handleRouteUpdate', () => {
  it('keeps routesByPath pointed at an index route when a pathless layout updates', () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/livestock/$farmId/medicine',
    })
    const pathlessRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      id: '_form',
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(pathlessRoute),
      path: 'new',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([
        pathlessRoute.addChildren([asAnyRoute(newRoute)]),
        asAnyRoute(indexRoute),
      ]),
    ])
    const router = createTestRouter(routeTree)
    const key = trimPathRight(indexRoute.fullPath)

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        pathlessRoute.id,
        asAnyRoute(new BaseRoute({} as any)),
      )
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
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/path',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([asAnyRoute(indexRoute)]),
    ])
    const router = createTestRouter(routeTree)
    const key = trimPathRight(indexRoute.fullPath)

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        parentRoute.id,
        asAnyRoute(new BaseRoute({} as any)),
      )
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
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => {
          return /^\d+$/.test(itemId) ? { itemId } : false
        },
      },
    })
    const routeTree = rootRoute.addChildren([asAnyRoute(itemRoute)])
    const router = createTestRouter(routeTree)

    expect(router.getMatchedRoutes('/items/abc').foundRoute?.id).toBeUndefined()

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        itemRoute.id,
        asAnyRoute(
          new BaseRoute({
            params: {
              parse: ({ itemId }: { itemId: string }) => ({ itemId }),
            },
          } as any),
        ),
      )
    } finally {
      restoreWindow()
    }

    expect(router.getMatchedRoutes('/items/abc').foundRoute?.id).toBe(
      itemRoute.id,
    )
  })

  it('hydrates the hot module route export with generated route tree state', () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
    })
    const routeTree = rootRoute.addChildren([asAnyRoute(itemRoute)])
    const router = createTestRouter(routeTree)
    const newRoute = new BaseRoute({} as any)

    expect((newRoute as any).to).toBeUndefined()

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(itemRoute.id, asAnyRoute(newRoute))
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

  it('removes stale loader data when a hot route removes its loader', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      loader: () => 'stale loader data',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/hot',
    )
    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      hotRoute.id,
    ])
    expect(router.state.matches[1]!.loaderData).toBe('stale loader data')

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(hotRoute.id, asAnyRoute(new BaseRoute({} as any)))
      await vi.waitFor(() => {
        expect(router.state.matches.map((match) => match.routeId)).toEqual([
          rootRoute.id,
          hotRoute.id,
        ])
        expect(router.state.matches[1]!.loaderData).toBeUndefined()
      })
    } finally {
      restoreWindow()
    }
  })

  it('does not run removed loader or beforeLoad callbacks on a later visit', async () => {
    const beforeLoad = vi.fn(() => ({ hotBeforeLoad: true }))
    const loader = vi.fn(() => 'hot loader data')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      beforeLoad,
      loader,
      staleTime: Infinity,
      gcTime: Infinity,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/other',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute), asAnyRoute(otherRoute)]),
      '/hot',
    )

    await router.load()
    await router.navigate({ to: '/other' })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)

    runHandleRouteUpdate(router, hotRoute.id, new BaseRoute({} as any))
    await router.navigate({ to: '/hot' })

    const match = router.state.matches.find(
      (candidate) => candidate.routeId === hotRoute.id,
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(match).toBeDefined()
    expect(match!.loaderData).toBeUndefined()
    expect(match!.context).not.toHaveProperty('hotBeforeLoad')
  })

  it('does not cache an obsolete inactive preload that settles after a hot update', async () => {
    let resolveOldLoader!: (value: string) => void
    const oldLoaderResult = new Promise<string>((resolve) => {
      resolveOldLoader = resolve
    })
    const oldLoader = vi.fn(() => oldLoaderResult)
    const newLoader = vi.fn(() => 'hot')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      loader: oldLoader,
      preloadStaleTime: Infinity,
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/',
    )

    await router.load()
    const preload = router.preloadRoute({ to: '/hot' })
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledOnce())

    runHandleRouteUpdate(
      router,
      hotRoute.id,
      new BaseRoute({ loader: newLoader } as any),
    )

    resolveOldLoader('obsolete')
    await preload
    await router.navigate({ to: '/hot' })

    expect(newLoader).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)?.loaderData).toBe('hot')
  })
})
