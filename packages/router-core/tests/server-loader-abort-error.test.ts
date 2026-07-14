import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A server loader that throws an AbortError while the match's own signal is
 * NOT aborted (e.g. the loader's own fetch timed out) is a route failure.
 * Only a router-aborted generation may discard AbortError as cancellation.
 */

describe('server loader AbortError', () => {
  test('settles as an error when the match signal is not aborted', async () => {
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
    expect(response.status).toBe(500)
    expect(match?.status).toBe('error')
    expect(match?.error).toMatchObject({
      name: 'AbortError',
      message: 'The operation was aborted.',
    })
  })
})
