import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('matchRoute', () => {
  test('matches the current route when only the trailing slash differs', async () => {
    const rootRoute = new BaseRootRoute({})
    const nestedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([nestedRoute]),
      history: createMemoryHistory({ initialEntries: ['/nested/'] }),
    })

    await router.load()

    expect(router.state.matches.at(-1)?.routeId).toBe('/nested')
    expect(router.matchRoute({ to: '/nested' })).toEqual({})
  })
})
