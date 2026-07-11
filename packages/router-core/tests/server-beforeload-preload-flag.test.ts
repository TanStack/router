import { createMemoryHistory } from '@tanstack/history'
import { expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('server beforeLoad receives preload false', async () => {
  const seen: Array<boolean> = []
  const rootRoute = new BaseRootRoute({})
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    beforeLoad: ({ preload }) => {
      seen.push(preload)
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer: true,
  })

  await router.load()

  expect(seen).toEqual([false])
})
