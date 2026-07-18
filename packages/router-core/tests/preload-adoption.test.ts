import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Preload adoption edge cases. The happy path (navigation adopts an
 * in-flight preload's successful loader run) and the control-flow
 * non-leakage path are pinned in load.test.ts; this file pins the
 * complete-lane adoption boundary. Identical lanes can be shared during either
 * serial contextualization or loader execution; different lanes never join
 * individual route loaders.
 */

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
      shouldReload: () => undefined,
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

  test('navigation adopts an identical preload during its serial phase', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const preloadSerialStarted = createControlledPromise<void>()
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
          preloadSerialStarted.resolve()
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
    await preloadSerialStarted
    expect(beforeLoadCalls).toBe(1)

    const navigation = router.navigate({ to: '/foo' })
    await Promise.resolve()
    expect(beforeLoadCalls).toBe(1)
    expect(loader).not.toHaveBeenCalled()

    beforeLoadGate.resolve()
    await Promise.all([preload, navigation])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('identical concurrent preloads share one full lane', async () => {
    const loaderGate = createControlledPromise<string>()
    const loaderStarted = createControlledPromise<void>()
    let preloadBeforeLoadCalls = 0
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
      preloadStaleTime: Infinity,
      beforeLoad: ({ preload }) => {
        if (preload) {
          preloadBeforeLoadCalls++
        }
      },
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const first = router.preloadRoute({ to: '/foo' } as any)
    await loaderStarted

    const second = router.preloadRoute({ to: '/foo' } as any)
    await Promise.resolve()
    expect(preloadBeforeLoadCalls).toBe(1)
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('once')
    await Promise.all([first, second])
    expect(loader).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === fooRoute.id)
        ?.loaderData,
    ).toBe('once')
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
      beforeLoad: () => undefined,
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

  test('navigation does not adopt a preload with different loader deps', async () => {
    const preloadBeforeLoadStarted = createControlledPromise<void>()
    const preloadBeforeLoadGate = createControlledPromise<void>()
    let generation = 1
    const loader = vi.fn(({ deps }) => deps.generation)

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loaderDeps: () => ({ generation }),
      beforeLoad: async ({ preload }) => {
        if (preload) {
          preloadBeforeLoadStarted.resolve()
          await preloadBeforeLoadGate
        }
      },
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await preloadBeforeLoadStarted

    generation = 2
    await router.navigate({ to: '/target' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)

    preloadBeforeLoadGate.resolve()
    await preload
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('navigation does not adopt a preload with different parsed params', async () => {
    const preloadBeforeLoadStarted = createControlledPromise<void>()
    const preloadBeforeLoadGate = createControlledPromise<void>()
    let generation = 1
    const loader = vi.fn(({ params }) => params.generation)

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target/$id',
      params: {
        parse: ({ id }) => ({ id, generation }),
        stringify: ({ id }) => ({ id }),
      },
      beforeLoad: async ({ preload }) => {
        if (preload) {
          preloadBeforeLoadStarted.resolve()
          await preloadBeforeLoadGate
        }
      },
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({
      to: '/target/$id',
      params: { id: 'one', generation: 1 },
    })
    await preloadBeforeLoadStarted

    generation = 2
    await router.navigate({
      to: '/target/$id',
      params: { id: 'one', generation: 2 },
    })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)

    preloadBeforeLoadGate.resolve()
    await preload
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('navigation retries a root not-found preload result', async () => {
    const preloadLoaderStarted = createControlledPromise<void>()
    const preloadLoaderGate = createControlledPromise<void>()
    const loader = vi.fn(async ({ preload }) => {
      if (preload) {
        preloadLoaderStarted.resolve()
        await preloadLoaderGate
        throw notFound()
      }
      return 'navigation data'
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await preloadLoaderStarted
    const navigation = router.navigate({ to: '/target' })

    preloadLoaderGate.resolve()
    await Promise.all([preload, navigation])

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      loaderData: 'navigation data',
    })
    expect(router.state.matches.some((match) => match.globalNotFound)).toBe(
      false,
    )
  })

  test('a superseded navigation stops waiting for an independent preload', async () => {
    const beforeLoadStarted = createControlledPromise<void>()
    const beforeLoadGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const slowRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/slow',
      beforeLoad: async () => {
        beforeLoadStarted.resolve()
        await beforeLoadGate
      },
      loader: () => 'slow data',
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, slowRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    let preloadSettled = false
    const preload = router.preloadRoute({ to: '/slow' }).then(() => {
      preloadSettled = true
    })
    await beforeLoadStarted

    let navigationSettled = false
    const navigation = router.navigate({ to: '/slow' }).then(() => {
      navigationSettled = true
    })
    await Promise.resolve()

    await router.navigate({ to: '/other' })
    await navigation

    expect(navigationSettled).toBe(true)
    expect(preloadSettled).toBe(false)
    expect(beforeLoadGate.status).toBe('pending')

    beforeLoadGate.resolve()
    await preload
  })

  test('clearing cache prevents a captured preload generation from being claimed', async () => {
    const stalePreloadStarted = createControlledPromise<void>()
    const stalePreloadGate = createControlledPromise<string>()
    const freshNavigationGate = createControlledPromise<string>()
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls++
      if (loaderCalls === 1) {
        return 'initial'
      }
      if (loaderCalls === 2) {
        stalePreloadStarted.resolve()
        return stalePreloadGate
      }
      return freshNavigationGate
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      shouldReload: true,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    expect(loader).toHaveBeenCalledTimes(1)

    const preload = router.preloadRoute({ to: '/target' })
    await stalePreloadStarted

    let navigationSettled = false
    const navigation = router.navigate({ to: '/target' }).then(() => {
      navigationSettled = true
    })
    await Promise.resolve()
    expect(loader).toHaveBeenCalledTimes(2)
    router.clearCache()

    stalePreloadGate.resolve('stale')
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3))
    expect(navigationSettled).toBe(false)

    freshNavigationGate.resolve('fresh')
    await Promise.all([preload, navigation])

    expect(router.state.matches.at(-1)?.loaderData).toBe('fresh')
  })

  test('an adopted beforeLoad signal is aborted when its navigation unloads', async () => {
    const beforeLoadStarted = createControlledPromise<void>()
    const beforeLoadGate = createControlledPromise<void>()
    let signal: AbortSignal | undefined
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad: async ({ abortController }) => {
        signal = abortController.signal
        beforeLoadStarted.resolve()
        await beforeLoadGate
      },
      loader: () => 'target data',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await beforeLoadStarted
    const navigation = router.navigate({ to: '/target' })

    beforeLoadGate.resolve()
    await Promise.all([preload, navigation])
    expect(signal?.aborted).toBe(false)

    await router.navigate({ to: '/' })
    expect(signal?.aborted).toBe(true)
  })

  test('navigation retries the full lane after an adopted preload fails', async () => {
    const preloadParentStarted = createControlledPromise<void>()
    const preloadFailureGate = createControlledPromise<void>()
    const navigationParentRetryStarted = createControlledPromise<void>()
    const childStarted = createControlledPromise<void>()
    const childGate = createControlledPromise<string>()
    let parentLoads = 0
    let childLoads = 0
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: () => undefined,
      loader: async ({ preload }) => {
        parentLoads++
        if (preload) {
          preloadParentStarted.resolve()
          await preloadFailureGate
          throw new Error('preload failed')
        }
        navigationParentRetryStarted.resolve()
        return 'navigation data'
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        childLoads++
        childStarted.resolve()
        return childGate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/child' } as any)
    await Promise.all([preloadParentStarted, childStarted])
    expect(parentLoads).toBe(1)
    expect(childLoads).toBe(1)

    const navigation = router.navigate({ to: '/parent/child' })
    await Promise.resolve()
    expect(preloadFailureGate.status).toBe('pending')
    expect(parentLoads).toBe(1)
    expect(childLoads).toBe(1)

    preloadFailureGate.resolve()
    await Promise.resolve()
    expect(parentLoads).toBe(1)
    childGate.resolve('child data')

    await navigationParentRetryStarted
    expect(parentLoads).toBe(2)
    expect(childLoads).toBe(2)

    await Promise.all([navigation, preload])

    expect(parentLoads).toBe(2)
    expect(childLoads).toBe(2)
    expect(router.state.location.pathname).toBe('/parent/child')
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.loaderData,
    ).toBe('navigation data')
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id)
        ?.loaderData,
    ).toBe('child data')
  })

  test('a route with preload disabled does not discard its preloaded ancestor', async () => {
    const parentLoader = vi.fn(() => 'parent data')
    const childLoader = vi.fn(() => 'child data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      preloadStaleTime: Infinity,
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      preload: false,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' } as any)
    await router.navigate({ to: '/parent/child' })

    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.loaderData,
    ).toBe('parent data')
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id)
        ?.loaderData,
    ).toBe('child data')
  })
})
