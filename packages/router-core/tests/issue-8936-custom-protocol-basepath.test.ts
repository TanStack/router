import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { LocationRewrite } from '../src'

function setup(origin: string, rewrite?: LocationRewrite) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    basepath: '/app-x',
    origin,
    rewrite,
    history: createMemoryHistory({ initialEntries: ['/app-x/'] }),
  })
}

// https://github.com/TanStack/router/issues/8936
describe('basepath on a custom-protocol origin', () => {
  test.each(['tauri://localhost:7644', 'tauri://localhost'])(
    'locations on the app origin %s are not external',
    (origin) => {
      const router = setup(origin)

      expect(router.latestLocation).toMatchObject({
        pathname: '/',
        publicHref: '/app-x/',
        external: false,
      })
      expect(
        router.buildLocation({ to: '/', search: true, hash: true }),
      ).toMatchObject({
        href: '/app-x/',
        publicHref: '/app-x/',
        external: false,
      })
      expect(router.buildLocation({ to: '/posts' })).toMatchObject({
        publicHref: '/app-x/posts',
        external: false,
      })
    },
  )

  test('a rewrite to another scheme or host is still external', () => {
    const router = setup('tauri://localhost:7644', {
      output: ({ url }) => {
        if (url.pathname.endsWith('/posts')) url.hostname = 'other-host'
        return url
      },
    })

    expect(router.buildLocation({ to: '/posts' })).toMatchObject({
      publicHref: 'tauri://other-host:7644/app-x/posts',
      external: true,
    })
  })
})
