import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

describe('preload adoption', () => {
  test('navigation waits for fresh data from an in-flight stale preload revalidation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const revalidationGate = createControlledPromise<{
      notifications: Array<string>
    }>()
    const revalidationStarted = createControlledPromise<void>()
    let loaderCalls = 0

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const notificationsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/notifications',
      staleTime: 0,
      preloadStaleTime: 0,
      gcTime: 60_000,
      loader: {
        staleReloadMode: 'blocking',
        handler: () => {
          loaderCalls++
          if (loaderCalls === 1) {
            return { notifications: ['old'] }
          }

          revalidationStarted.resolve()
          return revalidationGate
        },
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, notificationsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/notifications' } as any)

    expect(loaderCalls).toBe(1)

    // The cached successful preload is now stale. A second hover starts a
    // genuine revalidation while the user clicks the link.
    vi.setSystemTime(1)
    const revalidation = router.preloadRoute({
      to: '/notifications',
    } as any)
    await revalidationStarted
    expect(loaderCalls).toBe(2)

    let navigationSettled = false
    const navigation = router.navigate({ to: '/notifications' }).then(() => {
      navigationSettled = true
    })
    await Promise.resolve()

    // The navigation may share the revalidation, but it must not treat the
    // stale cached snapshot as the completed result while fresh work runs.
    expect(revalidationGate.status).toBe('pending')
    expect(navigationSettled).toBe(false)

    revalidationGate.resolve({ notifications: ['fresh'] })
    await Promise.all([revalidation, navigation])

    // A fix may either share the fresh revalidation or run a navigation
    // loader of its own; correctness only requires publishing fresh data.
    expect(loaderCalls).toBeGreaterThanOrEqual(2)
    expect(
      router.state.matches.find(
        (match) => match.routeId === notificationsRoute.id,
      )?.loaderData,
    ).toEqual({ notifications: ['fresh'] })
  })

  test('a fulfilled undefined loader result is adopted as success', async () => {
    const loaderGate = createControlledPromise<undefined>()
    const loaderStarted = createControlledPromise<void>()
    const loader = vi.fn(() => {
      loaderStarted.resolve()
      return loaderGate
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: vi.fn(),
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const preload = router.preloadRoute({ to: '/foo' })
    await loaderStarted
    const navigation = router.navigate({ to: '/foo' })
    await Promise.resolve()
    expect(loaderGate.status).toBe('pending')
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve(undefined)
    await Promise.all([preload, navigation])

    expect(loader).toHaveBeenCalledTimes(1)
    const match = router.state.matches.find(
      (candidate) => candidate.routeId === fooRoute.id,
    )
    expect(match?.status).toBe('success')
    expect(match?.loaderData).toBeUndefined()
  })
})
