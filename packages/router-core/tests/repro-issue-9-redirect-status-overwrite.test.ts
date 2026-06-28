import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute, notFound, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue 9: a redirect response status should not be overwritten by stale match
 * state on a reused server router. Once loadServerRouter catches a redirect,
 * the redirect status is the response status that should be preserved.
 *
 * This test first commits a notFound match on a real server router, then reuses
 * that router for a redirecting route. The redirect Location is present, but
 * stale notFound state must not rewrite the status from 302 to 404.
 */

describe('issue 9 redirect status overwrite', () => {
  test('keeps redirect status when a reused server router has stale notFound matches', async () => {
    const rootRoute = new BaseRootRoute({})
    const staleNotFoundRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/stale-not-found',
      beforeLoad: () => {
        throw notFound()
      },
      notFoundComponent: () => null,
    })
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      beforeLoad: () => {
        throw redirect({ to: '/target', statusCode: 302 })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        staleNotFoundRoute,
        redirectRoute,
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/stale-not-found'] }),
      isServer: true,
    })

    await router.load()

    expect(router.statusCode).toBe(404)
    expect(
      router.state.matches.some((match) => match.status === 'notFound'),
    ).toBe(true)

    await router.navigate({ to: '/redirect' })

    expect(router.redirect?.headers.get('Location')).toBe('/target')
    expect(router.statusCode).toBe(302)
  })
})
