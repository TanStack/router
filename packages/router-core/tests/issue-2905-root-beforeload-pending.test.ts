import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  rootRouteId,
} from '../src'
import { createTestRouter } from './routerTestUtils'

// Repro for https://github.com/TanStack/router/issues/2905
//
// A root route with an async beforeLoad and a pendingComponent must publish
// its pending match into router state on the INITIAL load (empty active lane)
// once pendingMs elapses, so frameworks can render the root pending UI instead
// of a blank page until beforeLoad resolves. Historically the pending lane was
// never published while root beforeLoad was in flight.
describe('issue #2905: root beforeLoad pending UI on initial load', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('root pending match is published after default pendingMs while beforeLoad is in flight', async () => {
    const beforeLoadGate = createControlledPromise<{ auth: string }>()
    const rootRoute = new BaseRootRoute({
      beforeLoad: () => beforeLoadGate,
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

    // Initial load: the active lane is empty until pending publication.
    expect(router.state.matches).toHaveLength(0)

    const load = router.load()
    load.catch(() => {})

    // Before the default pendingMs (1000ms) elapses, nothing is published.
    await vi.advanceTimersByTimeAsync(999)
    expect(router.state.matches).toHaveLength(0)

    // Crossing pendingMs publishes the render-ready pending lane so the root
    // pendingComponent can render while beforeLoad is still pending.
    await vi.advanceTimersByTimeAsync(1)
    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )
    expect(rootMatch).toBeDefined()
    expect(rootMatch?.status).toBe('pending')
    expect(rootMatch?._.loadPromise?.status).toBe('pending')

    // Publication is presentation only: the load must still settle normally.
    beforeLoadGate.resolve({ auth: 'ok' })
    await load

    const settledRoot = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )
    expect(settledRoot?.status).toBe('success')
    expect(settledRoot?.context).toMatchObject({ auth: 'ok' })
  })
})
