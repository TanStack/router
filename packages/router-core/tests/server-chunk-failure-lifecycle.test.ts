import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A primary route chunk failure observed by the server loader phase (a route
 * component preload or lazyFn rejection) must go through the same route
 * failure lifecycle as loader failures: the route's onError runs,
 * redirect/notFound conversion applies, and the errorComponent boundary
 * chunk is loaded. Only boundary component chunk failures commit directly
 * without recursing into another boundary chunk.
 *
 * These tests use a real server router load with a route component whose
 * preload rejects.
 */

describe('server route chunk failure lifecycle', () => {
  test('calls route onError once and loads the errorComponent chunk when the route component chunk rejects', async () => {
    const chunkError = new Error('component chunk failed')
    const capturedErrors: Array<unknown> = []
    const events: Array<string> = []

    const FailingComponent = Object.assign(() => null, {
      preload: () => Promise.reject(chunkError),
    })
    const ErrorBoundary = Object.assign(() => null, {
      preload: () => {
        events.push('errorComponent-preload')
        return Promise.resolve()
      },
    })

    const rootRoute = new BaseRootRoute({})
    const chunkedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      onError: (error: unknown) => {
        capturedErrors.push(error)
        events.push('onError')
      },
      component: FailingComponent as any,
      errorComponent: ErrorBoundary as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([chunkedRoute]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/chunked')

    const match = router.state.matches.find(
      (item) => item.routeId === chunkedRoute.id,
    )
    expect(capturedErrors).toEqual([chunkError])
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(chunkError)
    // Failure finalization loads the errorComponent boundary chunk after
    // onError ran. (The initial whole-route preload also requests it before
    // the failure, hence lastIndexOf.)
    expect(events.lastIndexOf('errorComponent-preload')).toBeGreaterThan(
      events.indexOf('onError'),
    )
    expect(response.status).toBe(500)
  })

  test('a notFound thrown from onError for a route chunk failure sets 404 instead of 500', async () => {
    const chunkError = new Error('component chunk failed')

    const FailingComponent = Object.assign(() => null, {
      preload: () => Promise.reject(chunkError),
    })

    const rootRoute = new BaseRootRoute({})
    const chunkedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      onError: () => {
        throw notFound()
      },
      component: FailingComponent as any,
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([chunkedRoute]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/chunked')

    const match = router.state.matches.find(
      (item) => item.routeId === chunkedRoute.id,
    )
    expect(response.status).toBe(404)
    expect(match?.status).toBe('notFound')
    expect(match?.error).toEqual(expect.objectContaining({ isNotFound: true }))
  })
})
