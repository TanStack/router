import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test('server resolves a redirect thrown while matching', async () => {
  const rootRoute = new BaseRootRoute({})
  const sourceRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    context: () => {
      throw redirect({ to: '/target' })
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
    isServer: true,
  })

  const response = await loadServerResponse(router, '/source')

  expect(response.status).toBe(307)
  expect(response.headers.get('Location')).toBe('/target')
})
