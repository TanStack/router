import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A settled success stay-match must keep its abortController un-aborted
 * across navigations and invalidations: loaders can hand that signal to
 * still-streaming deferred data (fetch(url, { signal }) consumed via
 * <Await>), and the documented contract only cancels the signal when the
 * route unloads or the loader call becomes outdated. Only pending or
 * actively-fetching matches are cancelled at load start.
 */

function setup(reloadGate?: Promise<void>) {
  let capturedSignal: AbortSignal | undefined
  let deferredRequestAbortCount = 0
  let loaderCalls = 0

  const rootRoute = new BaseRootRoute({})
  const dashboardRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    staleTime: Infinity,
    loader: ({ abortController }: { abortController: AbortController }) => {
      loaderCalls++
      capturedSignal = abortController.signal

      // A common streaming pattern is to return immediately-available data
      // alongside a request consumed later by <Await>. That request must stay
      // alive while this layout is reused, then be cancelled when it unloads.
      const deferredRequest = new Promise<'aborted'>((resolve) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            deferredRequestAbortCount++
            resolve('aborted')
          },
          { once: true },
        )
      })

      const data = { critical: 'dashboard data', deferredRequest }
      return reloadGate && loaderCalls > 1 ? reloadGate.then(() => data) : data
    },
  })
  const settingsRoute = new BaseRoute({
    getParentRoute: () => dashboardRoute,
    path: '/settings',
  })
  const loginRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      dashboardRoute.addChildren([settingsRoute]),
      loginRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })

  return {
    router,
    getSignal: () => capturedSignal,
    getDeferredRequestAbortCount: () => deferredRequestAbortCount,
  }
}

describe('stay-match abort scope', () => {
  test('navigating to a child route does not abort a fresh success stay-match', async () => {
    const { router, getSignal } = setup()

    await router.load()
    expect(getSignal()?.aborted).toBe(false)

    await router.navigate({ to: '/dashboard/settings' })
    expect(getSignal()?.aborted).toBe(false)
  })

  test('unloading a reused match aborts the signal exposed to its loader', async () => {
    const { router, getSignal, getDeferredRequestAbortCount } = setup()

    await router.load()
    const dashboardLoaderSignal = getSignal()

    // Reusing the dashboard layout for a child must preserve the lifetime of
    // its loader's deferred request.
    await router.navigate({ to: '/dashboard/settings' })
    expect(dashboardLoaderSignal?.aborted).toBe(false)
    expect(getDeferredRequestAbortCount()).toBe(0)

    // Leaving the layout altogether must now cancel that same request.
    await router.navigate({ to: '/login' })
    expect(dashboardLoaderSignal?.aborted).toBe(true)
    expect(getDeferredRequestAbortCount()).toBe(1)
  })

  test('cancelMatches aborts an active match with an in-flight beforeLoad marker', async () => {
    // A pending publication can move a lane into the active store while an
    // ancestor stay match is still mid-beforeLoad (status 'success',
    // isFetching 'beforeLoad', pending pool cleared). cancelMatches must
    // treat any fetching marker as in-flight work and abort it.
    const rootRoute = new BaseRootRoute({})
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      loader: () => 'a data',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })

    await router.load()

    const matchId = router.state.matches.find(
      (match) => match.routeId === aRoute.id,
    )!.id
    router.updateMatch(matchId, (match) => ({
      ...match,
      isFetching: 'beforeLoad' as const,
    }))
    const signal = router.getMatch(matchId)!.abortController.signal
    expect(signal.aborted).toBe(false)

    router.cancelMatches()
    expect(signal.aborted).toBe(true)
  })

  test('background invalidation keeps the old loader signal until fresh data commits', async () => {
    const reloadGate = createControlledPromise<void>()
    const { router, getSignal } = setup(reloadGate)

    await router.load()
    const firstSignal = getSignal()
    expect(firstSignal?.aborted).toBe(false)

    const invalidation = router.invalidate()
    await vi.waitFor(() => expect(getSignal()).not.toBe(firstSignal))

    // The old loader data is still the published generation while the
    // background replacement is private.
    expect(firstSignal?.aborted).toBe(false)

    reloadGate.resolve()
    await invalidation
    await vi.waitFor(() => expect(firstSignal?.aborted).toBe(true))
  })

  test.each(['beforeLoad', 'shouldReload'] as const)(
    '%s failure replacing a successful stay aborts its loader signal',
    async (failureStage) => {
      const failure = new Error(`${failureStage} failed`)
      const onAbort = vi.fn()
      let shouldFail = false
      let loaderSignal: AbortSignal | undefined

      const rootRoute = new BaseRootRoute({})
      const accountRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/account',
        staleTime: Infinity,
        beforeLoad: () => {
          if (shouldFail && failureStage === 'beforeLoad') {
            throw failure
          }
        },
        shouldReload: () => {
          if (shouldFail && failureStage === 'shouldReload') {
            throw failure
          }
          return false
        },
        loader: ({ abortController }: { abortController: AbortController }) => {
          loaderSignal = abortController.signal
          loaderSignal.addEventListener('abort', onAbort, { once: true })
          return { user: 'Flo' }
        },
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([accountRoute]),
        history: createMemoryHistory({ initialEntries: ['/account'] }),
      })

      await router.load()
      expect(loaderSignal?.aborted).toBe(false)

      shouldFail = true
      await router.load()

      const match = router.state.matches.find(
        (candidate) => candidate.routeId === accountRoute.id,
      )
      expect(match?.status).toBe('error')
      expect(match?.error).toBe(failure)
      expect(loaderSignal?.aborted).toBe(true)
      expect(onAbort).toHaveBeenCalledTimes(1)
    },
  )

  test.each([false, true])(
    'background notFound replacing successful data aborts its old loader signal (boundary fails: %s)',
    async (boundaryFails) => {
      let loaderCalls = 0
      let initialSignal: AbortSignal | undefined
      const boundaryError = new Error('notFound component failed')

      const rootRoute = new BaseRootRoute({})
      const accountRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/account',
        staleTime: Infinity,
        loader: ({ abortController }: { abortController: AbortController }) => {
          loaderCalls++
          if (loaderCalls === 1) {
            initialSignal = abortController.signal
            return { user: 'Flo' }
          }
          throw notFound()
        },
        notFoundComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([accountRoute]),
        history: createMemoryHistory({ initialEntries: ['/account'] }),
      })

      await router.load()
      expect(initialSignal?.aborted).toBe(false)
      if (boundaryFails) {
        accountRoute.options.notFoundComponent = {
          preload: () => {
            throw boundaryError
          },
        } as any
        ;(accountRoute as any)._componentsLoaded = false
      }

      await router.invalidate()
      await vi.waitFor(() =>
        expect(router.state.matches.at(-1)?.status).toBe(
          boundaryFails ? 'error' : 'notFound',
        ),
      )

      if (boundaryFails) {
        expect(router.state.matches.at(-1)?.error).toBe(boundaryError)
      }
      expect(initialSignal?.aborted).toBe(true)
    },
  )

  test('discarded successful background data aborts only its private loader signal', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    let loaderCalls = 0
    const loaderSignals: Array<AbortSignal> = []

    try {
      const rootRoute = new BaseRootRoute({})
      const accountRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/account',
        staleTime: Infinity,
        loader: ({ abortController }: { abortController: AbortController }) => {
          loaderSignals.push(abortController.signal)
          return { revision: ++loaderCalls }
        },
        head: ({ loaderData }) => {
          if (loaderData?.revision === 2) {
            throw new Error('fresh head failed')
          }
          return { meta: [{ title: 'account' }] }
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([accountRoute]),
        history: createMemoryHistory({ initialEntries: ['/account'] }),
      })

      await router.load()
      await router.invalidate()
      await vi.waitFor(() => expect(router._backgroundLoad).toBeUndefined())

      expect(router.state.matches.at(-1)?.loaderData).toEqual({ revision: 1 })
      expect(loaderSignals).toHaveLength(2)
      expect(loaderSignals[0]?.aborted).toBe(false)
      expect(loaderSignals[1]?.aborted).toBe(true)
    } finally {
      consoleError.mockRestore()
    }
  })
})
