import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue 5: server routers can be reused across requests, so request-scoped
 * redirect state must be cleared before each server load. Leaving router.redirect
 * set after a previous redirect lets a later successful request return the old
 * redirect response.
 *
 * This test reuses one real server router. The first load redirects from /from
 * to /target, then the same router is updated with a fresh /ok history and
 * loaded successfully. The second request should not retain the first redirect.
 */

describe('server router redirect reuse', () => {
  test('clears redirect on a later successful server load when reusing a router', async () => {
    const rootRoute = new BaseRootRoute({})
    const fromRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/from',
      beforeLoad: () => {
        throw redirect({ to: '/target', statusCode: 307 })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const okRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/ok',
      loader: () => 'ok',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fromRoute, targetRoute, okRoute]),
      history: createMemoryHistory({ initialEntries: ['/from'] }),
      isServer: true,
    })

    await router.load()

    expect(router.redirect?.options.href).toBe('/target')
    expect(router.redirect?.headers.get('Location')).toBe('/target')

    router.update({
      history: createMemoryHistory({ initialEntries: ['/ok'] }),
    })

    await router.load()

    expect(router.statusCode).toBe(200)
    expect(router.state.location.pathname).toBe('/ok')
    expect(router.state.matches.at(-1)?.loaderData).toBe('ok')
    expect(router.redirect).toBeUndefined()
  })
})
