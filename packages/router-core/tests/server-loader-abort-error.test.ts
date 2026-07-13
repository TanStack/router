import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A server loader that throws an AbortError while the match's own signal is
 * NOT aborted (e.g. the loader's own fetch timed out) is not a route
 * failure. It settles the match as a non-error instead of committing a 500.
 */

describe('server loader AbortError', () => {
  test('settles as non-error with a 200 status when the match signal is not aborted', async () => {
    const rootRoute = new BaseRootRoute({})
    const abortingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/aborting',
      loader: () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([abortingRoute]),
      history: createMemoryHistory({ initialEntries: ['/aborting'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/aborting')

    const match = router.state.matches.find(
      (item) => item.routeId === abortingRoute.id,
    )
    expect(response.status).toBe(200)
    expect(match?.status).toBe('success')
    expect(match?.error).toBeUndefined()
  })
})
