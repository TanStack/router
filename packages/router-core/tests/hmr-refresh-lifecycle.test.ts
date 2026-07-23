import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HMR route refresh', () => {
  test('reloads retained routes with onStay lifecycle semantics', async () => {
    let generation = 1
    const loader = vi.fn(() => generation)
    const onEnter = vi.fn()
    const onLeave = vi.fn()
    const order: Array<string> = []
    const onStay = vi.fn(() => order.push('onStay'))
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader,
      onEnter,
      onLeave,
      onStay,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const unsubLoad = router.subscribe('onLoad', () => order.push('onLoad'))
    const unsubMount = router.subscribe('onBeforeRouteMount', () =>
      order.push('onBeforeRouteMount'),
    )
    generation = 2
    await router._refreshRoute!()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onLeave).not.toHaveBeenCalled()
    expect(onStay).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['onStay', 'onLoad', 'onBeforeRouteMount'])
    unsubLoad()
    unsubMount()
  })

  test('retires refresh mode after an acknowledged publication', async () => {
    const otherLoader = vi.fn(() => 'other data')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      loader: otherLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    await router._refreshRoute!()
    await router.preloadRoute({ to: '/other' })

    expect(router._tx?.[6]).toBeUndefined()
    expect(otherLoader).toHaveBeenCalledOnce()
  })

  test('passes rematerialization to a reentrant preflight load', async () => {
    let generation = 1
    const loader = vi.fn(() => generation)
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      staleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    generation = 2
    let reenter = true
    let reentrantLoad: Promise<void> | undefined
    const unsubscribe = router.subscribe('onBeforeNavigate', () => {
      if (reenter) {
        reenter = false
        reentrantLoad = router.load({ sync: true })
      }
    })
    try {
      await router._refreshRoute!()
      await reentrantLoad
    } finally {
      unsubscribe()
    }

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)
  })

  test('passes rematerialization to a load that supersedes refresh work', async () => {
    let generation = 1
    let reenter = false
    let reentrantLoad: Promise<void> | undefined
    let router!: ReturnType<typeof createTestRouter>
    const loader = vi.fn(() => {
      if (reenter) {
        reenter = false
        reentrantLoad = router.load({ sync: true })
      }
      return generation
    })
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      staleTime: Infinity,
      loader,
    })
    router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    generation = 2
    reenter = true
    await router._refreshRoute!()
    await reentrantLoad

    expect(loader).toHaveBeenCalledTimes(3)
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)
  })

  test('passes rematerialization through a refresh redirect', async () => {
    let generation = 1
    let shouldRedirect = false
    const rootLoader = vi.fn(() => generation)
    const rootRoute = new BaseRootRoute({
      staleTime: Infinity,
      loader: rootLoader,
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: () => {
        if (shouldRedirect) {
          throw redirect({ to: '/target' })
        }
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
    })

    await router.load()
    generation = 2
    shouldRedirect = true
    await router._refreshRoute!()

    expect(router.state.location.pathname).toBe('/target')
    expect(rootLoader).toHaveBeenCalledTimes(2)
    expect(router.state.matches[0]?.loaderData).toBe(2)
  })

  test('restores the committed presentation when publication fails', async () => {
    let generation = 1
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const previousMatches = router.state.matches
    generation = 2
    const startTransition = router.startTransition
    router.startTransition = async (fn) => {
      fn()
      router.clearCache()
      throw new Error('render failed')
    }

    await router._refreshRoute!()

    expect(router.state.status).toBe('idle')
    expect(router.state.matches).toHaveLength(previousMatches.length)
    expect(router.state.matches.at(-1)?.loaderData).toBe(1)

    router.startTransition = startTransition
    generation = 3
    await router._refreshRoute!()
    expect(router.state.matches.at(-1)?.loaderData).toBe(3)
  })

  test('keeps the rendered generation alive until refresh is acknowledged', async () => {
    let generation = 1
    const signals: Array<AbortSignal> = []
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: ({ abortController }) => {
        signals.push(abortController.signal)
        return generation
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const renderedSignal = signals[0]!
    generation = 2
    const startTransition = router.startTransition
    router.startTransition = async (fn) => {
      fn()
      throw new Error('render failed')
    }

    await router._refreshRoute!()

    expect(renderedSignal.aborted).toBe(false)
    expect(signals[1]?.aborted).toBe(true)
    expect(router.state.matches.at(-1)?.loaderData).toBe(1)

    router.startTransition = startTransition
    generation = 3
    await router._refreshRoute!()
    expect(renderedSignal.aborted).toBe(true)
    expect(router.state.matches.at(-1)?.loaderData).toBe(3)
  })

  test('rolls overlapping refreshes back to the last acknowledged generation', async () => {
    let generation = 1
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    let transitionCount = 0
    let supersedeFirst!: () => void
    router.startTransition = (fn) => {
      transitionCount++
      fn()
      if (transitionCount === 1) {
        return new Promise<boolean>((resolve) => {
          supersedeFirst = () => resolve(false)
        })
      }
      return Promise.reject(new Error('replacement render failed'))
    }
    ;(
      router as typeof router & { _cancelTransition?: () => void }
    )._cancelTransition = () => supersedeFirst()

    generation = 2
    const firstRefresh = router._refreshRoute!()
    await vi.waitFor(() => expect(transitionCount).toBe(1))

    generation = 3
    const secondRefresh = router._refreshRoute!()
    await Promise.all([firstRefresh, secondRefresh])

    expect(router.state.status).toBe('idle')
    expect(router.state.matches.at(-1)?.loaderData).toBe(1)
  })

  test('does not resolve a superseding navigation promise during rollback', async () => {
    let generation = 1
    const destinationGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
    })
    const destinationRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/destination',
      loader: () => destinationGate,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, destinationRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    let transitionCount = 0
    let cancelRefresh!: () => void
    router.startTransition = (fn) => {
      transitionCount++
      fn()
      if (transitionCount === 1) {
        return new Promise<boolean>((resolve) => {
          cancelRefresh = () => resolve(false)
        })
      }
      return Promise.resolve(true)
    }
    ;(
      router as typeof router & { _cancelTransition?: () => void }
    )._cancelTransition = () => cancelRefresh()

    generation = 2
    const refresh = router._refreshRoute!()
    await vi.waitFor(() => expect(transitionCount).toBe(1))

    const navigationSettled = vi.fn()
    const navigation = router
      .navigate({ to: '/destination' })
      .then(navigationSettled)
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/destination'),
    )
    expect(navigationSettled).not.toHaveBeenCalled()

    destinationGate.resolve()
    await Promise.all([refresh, navigation])
    expect(navigationSettled).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)?.routeId).toBe(destinationRoute.id)
  })

  test('waits for an ordinary pending navigation before refreshing', async () => {
    const destinationGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
    })
    const destinationRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/destination',
      pendingMs: 0,
      pendingMinMs: 0,
      pendingComponent: () => null,
      loader: () => destinationGate,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, destinationRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/destination' })
    await vi.waitFor(() => {
      expect(router.state.status).toBe('pending')
      expect(router.state.matches.at(-1)?.routeId).toBe(destinationRoute.id)
    })
    destinationRoute.options.onStay = () => {
      throw new Error('refreshed destination failed')
    }
    const refreshSettled = vi.fn()
    const refresh = router._refreshRoute!().then(refreshSettled)
    await Promise.resolve()
    expect(refreshSettled).not.toHaveBeenCalled()

    destinationGate.resolve()
    await Promise.all([navigation, refresh])

    expect(router.state.status).toBe('idle')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: destinationRoute.id,
      status: 'success',
    })
    expect(refreshSettled).toHaveBeenCalledOnce()
  })

  test('rolls back when an HMR lifecycle callback throws', async () => {
    let generation = 1
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    generation = 2
    pageRoute.options.onStay = () => {
      throw new Error('lifecycle failed')
    }

    await router._refreshRoute!()

    expect(router.state.status).toBe('idle')
    expect(router.state.matches.at(-1)?.loaderData).toBe(1)

    pageRoute.options.onStay = undefined
    generation = 3
    await router._refreshRoute!()
    expect(router.state.matches.at(-1)?.loaderData).toBe(3)
  })

  test('does not adopt a preload created by HMR preflight hooks', async () => {
    let generation = 1
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    generation = 2
    const unsubscribe = router.subscribe('onBeforeLoad', () => {
      void router.preloadRoute({ to: '/page' })
    })
    try {
      await router._refreshRoute!()
    } finally {
      unsubscribe()
    }

    expect(router.state.matches.at(-1)?.loaderData).toBe(2)
  })
})
