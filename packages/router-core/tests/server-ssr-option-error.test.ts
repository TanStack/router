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

  test('retains inherited renderability and loads the lazy error boundary', async () => {
    const boom = new Error('SSR policy failed')
    const errorBoundaryPreload = vi.fn(() => Promise.resolve())
    const ErrorBoundary = Object.assign(() => null, {
      preload: errorBoundaryPreload,
    })
    const rootRoute = new BaseRootRoute({})
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      ssr: async () => {
        await Promise.resolve()
        throw boom
      },
    })
    const lazy = vi.fn(() =>
      Promise.resolve({
        options: {
          id: reportsRoute.id,
          errorComponent: ErrorBoundary,
        },
      }),
    )
    reportsRoute.lazy(lazy as any)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([reportsRoute]),
      history: createMemoryHistory({ initialEntries: ['/reports'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/reports')

    expect(response.status).toBe(500)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: reportsRoute.id,
      status: 'error',
      error: boom,
      ssr: true,
    })
    expect(lazy).toHaveBeenCalledTimes(1)
    expect(errorBoundaryPreload).toHaveBeenCalledTimes(1)
  })
})
