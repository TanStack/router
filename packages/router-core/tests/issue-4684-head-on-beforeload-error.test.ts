import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

// https://github.com/TanStack/router/issues/4684
//
// When beforeLoad throws, head() must still execute for the retained lane —
// the root head owns global stylesheets/title that the errorComponent page
// depends on, and the failing route's own head can provide error-specific
// head content.
describe('issue #4684: head executes when beforeLoad throws', () => {
  const setup = (isServer: boolean) => {
    const beforeLoadError = new Error('beforeLoad failed')
    const rootHead = vi.fn(() => ({
      meta: [{ title: 'Root title' }],
      links: [{ rel: 'stylesheet', href: '/global.css' }],
    }))
    const failingHead = vi.fn(({ match }: any) => ({
      meta: [{ title: match.error ? 'Error title' : 'Success title' }],
    }))

    const rootRoute = new BaseRootRoute({ head: rootHead })
    const failingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fail',
      beforeLoad: () => {
        throw beforeLoadError
      },
      head: failingHead,
      errorComponent: () => 'error',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([failingRoute]),
      history: createMemoryHistory({ initialEntries: ['/fail'] }),
      isServer,
    })

    return { router, rootRoute, failingRoute, rootHead, failingHead }
  }

  test('server load projects root and failing-route heads for the error lane', async () => {
    const { router, rootRoute, failingRoute, rootHead, failingHead } =
      setup(true)

    const response = await loadServerResponse(router, '/fail')

    expect(response.status).toBe(500)
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(failingHead).toHaveBeenCalledTimes(1)

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const failingMatch = router.state.matches.find(
      (match) => match.routeId === failingRoute.id,
    )
    expect(rootMatch?.meta).toEqual([{ title: 'Root title' }])
    expect(rootMatch?.links).toEqual([
      { rel: 'stylesheet', href: '/global.css' },
    ])
    expect(failingMatch?.status).toBe('error')
    expect(failingMatch?.meta).toEqual([{ title: 'Error title' }])
  })

  test('client load projects root and failing-route heads for the error lane', async () => {
    const { router, rootRoute, failingRoute, rootHead, failingHead } =
      setup(false)

    await router.load()

    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(failingHead).toHaveBeenCalledTimes(1)

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const failingMatch = router.state.matches.find(
      (match) => match.routeId === failingRoute.id,
    )
    expect(rootMatch?.meta).toEqual([{ title: 'Root title' }])
    expect(failingMatch?.status).toBe('error')
    expect(failingMatch?.meta).toEqual([{ title: 'Error title' }])
  })
})
