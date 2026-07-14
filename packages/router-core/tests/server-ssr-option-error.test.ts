import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A functional ssr() option is user route code in the server serial phase.
 * If it throws an ordinary error, the route must not be committed as a
 * successful 200 response with missing loader data. It follows the same
 * renderable route-error lifecycle as beforeLoad and loader failures.
 */
describe('server functional ssr() errors', () => {
  test('commits the throwing route as an error and returns 500', async () => {
    const boom = new Error('feature flag lookup failed')
    const loader = vi.fn(() => 'reports data')
    const onError = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      ssr: () => {
        throw boom
      },
      loader,
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([reportsRoute]),
      history: createMemoryHistory({ initialEntries: ['/reports'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/reports')

    const reportsMatch = router.state.matches.find(
      (match) => match.routeId === reportsRoute.id,
    )
    expect(loader).not.toHaveBeenCalled()
    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(reportsMatch).toMatchObject({
      status: 'error',
      error: boom,
    })
  })
})
