import { createMemoryHistory } from '@tanstack/history'
import { bench, describe, expect } from 'vitest'
import { BaseRootRoute, BaseRoute, setupScrollRestoration } from '../src'
import { createTestRouter } from './routerTestUtils'

for (const scrollRestoration of [false, true, 'mixed'] as const) {
  for (const ownerCount of [1, 8]) {
    if (scrollRestoration === 'mixed' && ownerCount === 1) {
      continue
    }
    describe(`scroll restoration=${scrollRestoration}, owners=${ownerCount}`, () => {
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const originalDestroy = history.destroy
      const routers = Array.from({ length: ownerCount }, (_, index) => {
        const rootRoute = new BaseRootRoute({})
        const indexRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([indexRoute]),
          history,
          scrollRestoration:
            scrollRestoration === 'mixed' ? index % 2 === 0 : scrollRestoration,
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

for (const ownerCount of [1, 8]) {
  describe(`history replacement, owners=${ownerCount}`, () => {
    const histories = [
      createMemoryHistory({ initialEntries: ['/'] }),
      createMemoryHistory({ initialEntries: ['/'] }),
    ] as const
    const originalDestroy = histories.map((history) => history.destroy)
    const routers = Array.from({ length: ownerCount }, () => {
      const rootRoute = new BaseRootRoute({})
      return createTestRouter({
        routeTree: rootRoute,
        history: histories[0],
        scrollRestoration: true,
      })
    })
    histories[0].destroy()
    const replace = () => {
      for (const router of routers) {
        setupScrollRestoration(router)
      }
      for (const history of [histories[1], histories[0]]) {
        for (const router of routers) {
          router.update({ history })
        }
      }
      histories[0].destroy()
    }

    replace()
    expect(histories[0].destroy).toBe(originalDestroy[0])
    expect(histories[1].destroy).toBe(originalDestroy[1])
    for (const router of routers) {
      expect(router.history).toBe(histories[0])
      expect(router.subscribers.size).toBe(0)
    }

    bench('replace shared history and return', replace, { time: 2_000 })
  })
}
