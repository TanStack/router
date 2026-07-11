import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('view-transition final commit failure', () => {
  const unhandledRejections = new Set<unknown>()
  const onUnhandledRejection = (error: unknown) => {
    unhandledRejections.add(error)
  }

  afterEach(() => {
    process.off('unhandledRejection', onUnhandledRejection)
    unhandledRejections.clear()
    vi.restoreAllMocks()
  })

  test('a wrapper rejection before its callback still commits the destination and cleans loading state', async () => {
    const failure = new Error('view transition rejected before update')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const destinationRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/destination',
      loader: () => 'destination data',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, destinationRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    process.on('unhandledRejection', onUnhandledRejection)
    // Solid-style framework transitions may defer the commit callback. A
    // failed view-transition fallback must publish before the router clears
    // this load's ownership, rather than enqueue work that currentness will
    // correctly reject one microtask later.
    router.startTransition = (update) => {
      queueMicrotask(update)
    }
    router.startViewTransition = vi.fn(async () => {
      throw failure
    })

    await router.navigate({ to: '/destination', viewTransition: true })

    expect(router.state.location.pathname).toBe('/destination')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      destinationRoute.id,
    ])
    expect(router.state.matches.at(-1)?.loaderData).toBe('destination data')
    expect(router.stores.isLoading.get()).toBe(false)
    expect(router.stores.pendingMatches.get()).toEqual([])
    await vi.waitFor(() => expect(unhandledRejections).toContain(failure))
  })

  test('a wrapper rejection after its callback does not commit the destination twice', async () => {
    const failure = new Error('view transition rejected after update')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const destinationRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/destination',
      loader: () => 'destination data',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, destinationRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const setMatches = vi.spyOn(router.stores, 'setMatches')
    process.on('unhandledRejection', onUnhandledRejection)
    router.startViewTransition = vi.fn(async (update) => {
      await update()
      throw failure
    })

    await router.navigate({ to: '/destination', viewTransition: true })

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      destinationRoute.id,
    ])
    expect(router.stores.isLoading.get()).toBe(false)
    expect(router.stores.pendingMatches.get()).toEqual([])
    expect(setMatches).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(unhandledRejections).toContain(failure))
  })
})
