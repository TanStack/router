import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Preload adoption edge cases. The happy path (navigation adopts an
 * in-flight preload's successful loader run) and the control-flow
 * non-leakage path are pinned in load.test.ts; this file pins the
 * deadlock guard: adoption is gated on the donor's loader being in
 * flight, because a preload still in its serial phase can itself be
 * waiting on the navigation through the borrow protocol.
 */

describe('preload adoption', () => {
  test('navigating during the preload serial phase does not deadlock (adoption declined)', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    let beforeLoadCalls = 0
    const loader = vi.fn(() => 'data')

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: async () => {
        beforeLoadCalls++
        if (beforeLoadCalls === 1) {
          // Keep the PRELOAD's serial phase in flight; the navigation's
          // own beforeLoad (call 2) proceeds immediately.
          await beforeLoadGate
        }
      },
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Preload is stuck in its serial phase — its loader has NOT started.
    const preload = router.preloadRoute({ to: '/foo' } as any)
    await vi.waitFor(() => expect(beforeLoadCalls).toBe(1))

    // The navigation must not join a donor whose loader is not in flight;
    // it runs its own loader and completes without waiting on the preload.
    await router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === fooRoute.id)
        ?.status,
    ).toBe('success')

    beforeLoadGate.resolve()
    await preload
  })

  test('a sibling preload adopts another preload lane\'s in-flight loader', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const first = router.preloadRoute({ to: '/foo' } as any)
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const second = router.preloadRoute({ to: '/foo' } as any)
    loaderGate.resolve('once')
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.stores.cachedMatches
        .get()
        .find((match) => match.routeId === fooRoute.id)?.loaderData,
    ).toBe('once')
  })
})
