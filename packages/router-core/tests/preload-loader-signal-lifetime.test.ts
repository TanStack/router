import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function setup(preloadGcTime = 60_000) {
  const loaderSignals: Array<AbortSignal> = []
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      loaderSignals.push(abortController.signal)
      return {
        critical: 'reports',
        deferredRequest: new Promise<'aborted'>((resolve) => {
          abortController.signal.addEventListener(
            'abort',
            () => resolve('aborted'),
            { once: true },
          )
        }),
      }
    },
  )

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    preloadGcTime,
    loader,
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, reportsRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return { router, reportsRoute, loader, loaderSignals }
}

describe('preload loader signal lifetime', () => {
  test('clearCache aborts a loader signal owned only by the preload cache', async () => {
    const { router, reportsRoute, loaderSignals } = setup()

    await router.load()
    await router.preloadRoute({ to: '/reports' })

    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === reportsRoute.id),
    ).toBe(true)
    expect(loaderSignals[0]?.aborted).toBe(false)

    router.clearCache()

    expect(loaderSignals[0]?.aborted).toBe(true)
  })

  test('cache GC aborts an expired preload loader signal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)

    try {
      const { router, loaderSignals } = setup(10)

      await router.load()
      await router.preloadRoute({ to: '/reports' })
      expect(loaderSignals[0]?.aborted).toBe(false)

      vi.setSystemTime(1_011)
      await router.navigate({ to: '/other' })

      expect(loaderSignals[0]?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test('cache removal for navigation retains the adopted loader signal until unload', async () => {
    const { router, loader, loaderSignals } = setup()

    await router.load()
    await router.preloadRoute({ to: '/reports' })
    const preloadSignal = loaderSignals[0]

    await router.navigate({ to: '/reports' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(preloadSignal?.aborted).toBe(false)

    await router.navigate({ to: '/other' })

    expect(preloadSignal?.aborted).toBe(true)
  })

  test('blocking navigation reload aborts the replaced preload loader signal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)

    try {
      const loaderSignals: Array<AbortSignal> = []
      const loader = vi.fn(
        ({ abortController }: { abortController: AbortController }) => {
          loaderSignals.push(abortController.signal)
          return { generation: loaderSignals.length }
        },
      )
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const reportsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/reports',
        staleTime: 0,
        preloadStaleTime: 0,
        loader: {
          staleReloadMode: 'blocking',
          handler: loader,
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, reportsRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      await router.preloadRoute({ to: '/reports' })
      const preloadSignal = loaderSignals[0]
      expect(preloadSignal?.aborted).toBe(false)

      vi.setSystemTime(1_001)
      await router.navigate({ to: '/reports' })

      expect(loader).toHaveBeenCalledTimes(2)
      expect(preloadSignal?.aborted).toBe(true)
      expect(loaderSignals[1]?.aborted).toBe(false)
      expect(
        router.state.matches.find((match) => match.routeId === reportsRoute.id)
          ?.loaderData,
      ).toEqual({ generation: 2 })
    } finally {
      vi.useRealTimers()
    }
  })
})
