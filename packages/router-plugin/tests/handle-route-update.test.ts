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

function createClientTestRouter(routeTree: AnyRoute, initialEntry: string) {
  return new RouterCore(
    {
      routeTree,
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      isServer: false,
      origin: 'http://localhost',
    },
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

function runHandleRouteUpdate(
  router: RouterCore<any, any, any, any, any>,
  routeId: string,
  newRoute: AnyRoute,
) {
  const restoreWindow = withWindowRouter(router)
  try {
    getHandleRouteUpdate()(routeId, newRoute)
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

  it('removes stale loader data when a hot route removes its loader', async () => {
    const rootRoute = new BaseRootRoute({
      loader: () => 'stale loader data',
    })
    const router = createTestRouter(rootRoute)
    await router.load()

    expect(router.state.matches[0]?.loaderData).toBe('stale loader data')

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(rootRoute.id, new BaseRootRoute({}))
      await vi.waitFor(() => {
        expect(router.state.matches[0]?.loaderData).toBeUndefined()
      })
    } finally {
      restoreWindow()
    }
  })

  it('keeps hot loader data when an older refresh settles later', async () => {
    let resolveStaleRefresh!: (value: string) => void
    const staleRefresh = new Promise<string>((resolve) => {
      resolveStaleRefresh = resolve
    })
    const oldLoader = vi
      .fn<() => string | Promise<string>>()
      .mockReturnValueOnce('initial')
      .mockReturnValueOnce(staleRefresh)
    const newLoader = vi.fn(() => 'hot')
    const rootRoute = new BaseRootRoute({ loader: oldLoader })
    const router = createClientTestRouter(rootRoute, '/')

    await router.load()
    expect(router.state.matches[0]?.loaderData).toBe('initial')

    const oldRefresh = router.invalidate()
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledTimes(2))

    runHandleRouteUpdate(
      router,
      rootRoute.id,
      new BaseRootRoute({ loader: newLoader }),
    )

    await vi.waitFor(() => {
      expect(router.state.matches[0]?.loaderData).toBe('hot')
    })

    resolveStaleRefresh('stale')
    await oldRefresh

    expect(newLoader).toHaveBeenCalled()
    expect(router.state.matches[0]?.loaderData).toBe('hot')
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
      getParentRoute: () => rootRoute,
      path: '/hot',
      loader: oldLoader,
      preloadStaleTime: Infinity,
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([hotRoute]),
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

  it('observes hot parser and route-context changes on the active route', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => ({
          itemId,
          parser: 'old',
        }),
      },
      context: () => ({ source: 'old' }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([itemRoute]),
      '/items/abc',
    )

    await router.load()
    expect(router.state.matches[1]?.params).toMatchObject({ parser: 'old' })
    expect(router.state.matches[1]?.context).toMatchObject({ source: 'old' })

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({
        params: {
          parse: ({ itemId }: { itemId: string }) => ({
            itemId,
            parser: 'new',
          }),
        },
        context: () => ({ source: 'new' }),
      } as any),
    )

    await vi.waitFor(() => {
      expect(router.state.matches[1]?.params).toMatchObject({ parser: 'new' })
      expect(router.state.matches[1]?.context).toMatchObject({ source: 'new' })
    })
  })

  it('rematerializes descendants when a parent route definition changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: () => ({ source: 'old' }),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      context: ({ context }) => ({ inheritedSource: context.source }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      '/parent/child',
    )

    await router.load()
    expect(router.state.matches[2]?.context).toMatchObject({
      inheritedSource: 'old',
    })

    runHandleRouteUpdate(
      router,
      parentRoute.id,
      new BaseRoute({ context: () => ({ source: 'new' }) } as any),
    )

    await vi.waitFor(() => {
      expect(router.state.matches[2]?.context).toMatchObject({
        inheritedSource: 'new',
      })
    })
  })

  it('does not run removed loader or beforeLoad callbacks on a later visit', async () => {
    const beforeLoad = vi.fn(() => ({ hotBeforeLoad: true }))
    const loader = vi.fn(() => 'hot loader data')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hot',
      beforeLoad,
      loader,
      staleTime: Infinity,
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
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)

    runHandleRouteUpdate(router, hotRoute.id, new BaseRoute({} as any))
    await router.navigate({ to: '/hot' })

    const match = router.state.matches.find(
      (candidate) => candidate.routeId === hotRoute.id,
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(match?.loaderData).toBeUndefined()
    expect(match?.context).not.toHaveProperty('hotBeforeLoad')
  })

  it('removes projected head and body scripts after a hot update', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hot',
      head: () => ({
        meta: [{ title: 'hot title' }],
        scripts: [{ src: '/hot-head.js' }],
      }),
      scripts: () => [{ src: '/hot-body.js' }],
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([hotRoute]),
      '/hot',
    )

    await router.load()
    expect(router.state.matches[1]).toMatchObject({
      meta: [{ title: 'hot title' }],
      headScripts: [{ src: '/hot-head.js' }],
      scripts: [{ src: '/hot-body.js' }],
    })

    runHandleRouteUpdate(router, hotRoute.id, new BaseRoute({} as any))

    await vi.waitFor(() => {
      expect(router.state.matches[1]?.meta).toBeUndefined()
      expect(router.state.matches[1]?.headScripts).toBeUndefined()
      expect(router.state.matches[1]?.scripts).toBeUndefined()
    })
  })
})
