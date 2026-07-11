import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  rootRouteId,
} from '../src'
import { createTestRouter } from './routerTestUtils'

// Repro for https://github.com/TanStack/router/issues/2182
//
// A root route with an async loader and a pendingComponent must publish its
// pending match into router state on the INITIAL page visit once pendingMs
// elapses, so the root pending UI can render instead of an empty page while
// the root loader is unresolved. This pins the loader arm of pending
// publication (no beforeLoad involved), which historically required the
// wrapInSuspense workaround.
describe('issue #2182: root loader pending UI on initial page visit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('root pending match is published after default pendingMs while the root loader is in flight', async () => {
    const loaderGate = createControlledPromise<{ user: string }>()
    const rootRoute = new BaseRootRoute({
      loader: () => loaderGate,
      pendingComponent: () => null,
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    // Initial visit: nothing rendered/published yet.
    expect(router.state.matches).toHaveLength(0)

    const load = router.load()
    load.catch(() => {})
    let loadSettled = false
    void load.finally(() => {
      loadSettled = true
    })

    // Let the loader start; before pendingMs nothing is published.
    await vi.advanceTimersByTimeAsync(999)
    expect(router.state.matches).toHaveLength(0)

    // Crossing the default pendingMs (1000ms) publishes the render-ready
    // pending lane: the root match is now visible with status 'pending' so
    // the root pendingComponent can render.
    await vi.advanceTimersByTimeAsync(1)
    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )
    expect(rootMatch).toBeDefined()
    expect(rootMatch?.status).toBe('pending')
    expect(rootMatch?.isFetching).toBe('loader')
    expect(loadSettled).toBe(false)

    // Resolving the loader completes the final commit with loader data.
    loaderGate.resolve({ user: 'flo' })
    await load
    expect(loadSettled).toBe(true)

    const settledRoot = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )
    expect(settledRoot?.status).toBe('success')
    expect(settledRoot?.loaderData).toEqual({ user: 'flo' })
  })
})
