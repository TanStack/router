import { createMemoryHistory } from '@tanstack/history'
import { bench, describe, expect } from 'vitest'
import { BaseRootRoute, BaseRoute, setupScrollRestoration } from '../src'
import { createTestRouter } from './routerTestUtils'

for (const scrollRestoration of [false, true]) {
  for (const ownerCount of [1, 8]) {
    describe(`scroll restoration=${scrollRestoration}, owners=${ownerCount}`, () => {
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const originalDestroy = history.destroy
      const routers = Array.from({ length: ownerCount }, () => {
        const rootRoute = new BaseRootRoute({})
        const indexRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([indexRoute]),
          history,
          scrollRestoration,
        })
      })
      history.destroy()

      const run = () => {
        for (const router of routers) {
          setupScrollRestoration(router)
          setupScrollRestoration(router)
        }
        history.destroy()
      }

      run()
      expect(history.destroy).toBe(originalDestroy)
      for (const router of routers) {
        expect(router.subscribers.size).toBe(0)
      }

      bench(
        'attach, repeat setup, and destroy',
        () => {
          // Batch lifecycle work so individual timer reads do not dominate it.
          for (let index = 0; index < 100; index++) {
            run()
          }
        },
        { time: 2_000 },
      )
    })
  }
}
