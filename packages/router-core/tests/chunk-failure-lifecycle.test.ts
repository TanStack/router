import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * primary route chunk failures should go through the same route-error
 * lifecycle as loader and beforeLoad failures. Skipping normalization means
 * route onError callbacks, redirects, and notFound values from lazy/chunk
 * loading can behave differently from other route failures.
 *
 * This test uses a real router navigation to a lazy route whose chunk rejects.
 * The match reaches error state with the chunk error, but the route's onError
 * callback should also receive that error as part of normal route failure
 * handling.
 */

describe('route chunk failure lifecycle', () => {
  test('calls route onError when lazy route chunk rejects during navigation', async () => {
    const chunkError = new Error('lazy chunk failed')
    let capturedError: unknown

    const rootRoute = new BaseRootRoute({})
    const lazyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/lazy',
      onError: (error) => {
        capturedError = error
      },
    }).lazy(() => Promise.reject(chunkError))

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([lazyRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.navigate({ to: '/lazy' })

    const lazyMatch = router.state.matches.find(
      (match) => match.routeId === lazyRoute.id,
    )
    expect(lazyMatch?.status).toBe('error')
    expect(lazyMatch?.error).toBe(chunkError)
    expect(capturedError).toBe(chunkError)
  })
})
