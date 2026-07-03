import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * boundary component preloads should not be blocked by an unrelated
 * normal route component preload. A route load starts the normal component
 * preload before the loader settles; if that loader throws, the error boundary
 * asks to load only the route's errorComponent.
 *
 * This test uses a real client router load. It keeps the normal route component
 * preload pending, resolves the errorComponent preload, and expects the route
 * error state to be committed without waiting for the normal component chunk.
 */

const pendingGates: Array<ReturnType<typeof createControlledPromise<void>>> = []
const pendingLoads: Array<Promise<unknown>> = []

afterEach(async () => {
  for (const gate of pendingGates) {
    gate.resolve()
  }

  await Promise.allSettled(pendingLoads)

  pendingGates.length = 0
  pendingLoads.length = 0
})

describe('route boundary component preloads', () => {
  test('errorComponent preload resolves without waiting for a pending route component preload', async () => {
    const componentGate = createControlledPromise<void>()
    const errorComponentGate = createControlledPromise<void>()
    const routeError = new Error('loader failed')
    let errorComponentPreloadCalls = 0
    pendingGates.push(componentGate, errorComponentGate)

    const SlowRouteComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })
    const ErrorBoundary = Object.assign(() => null, {
      preload: () => {
        errorComponentPreloadCalls++
        return errorComponentGate
      },
    })

    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      loader: () => {
        throw routeError
      },
      component: SlowRouteComponent as any,
      errorComponent: ErrorBoundary as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
    })

    const loadPromise = router.load()
    pendingLoads.push(loadPromise)

    await vi.waitFor(() => expect(errorComponentPreloadCalls).toBe(1))
    errorComponentGate.resolve()
    await Promise.resolve()

    const match = router.state.matches.find((item) => item.routeId === route.id)
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(routeError)

    componentGate.resolve()
    await loadPromise
  })
})
