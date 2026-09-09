import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

if (process.env.TSR_LINK_PERF === '1') {
  describe.each(['stable', 'changed', 'no-update'] as const)(
    'path decoder: %s configuration',
    (mode) => {
      const root = new BaseRootRoute({})
      const item = new BaseRoute({
        getParentRoute: () => root,
        path: '/items/$id',
      })
      const router = createTestRouter({
        routeTree: root.addChildren([item]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        pathParamsAllowedCharacters: ['@'],
        scrollRestoration: false,
      })
      router.history.destroy()
      const inputs = Array.from({ length: 200 }, (_, index) => ({
        to: '/items/$id',
        params: { id: `item-${index % 40}@+` },
      }))
      let count = 0
      let lastHref = ''
      const run = () => {
        count++
        if (mode !== 'no-update') {
          router.update({
            ...router.options,
            context: { count },
            pathParamsAllowedCharacters:
              mode === 'changed' && count % 2 === 0 ? ['+'] : ['@'],
          })
        }
        for (const input of inputs) {
          lastHref = router.buildLocation(input).href
        }
      }
      const verify = () => {
        expect(lastHref).toBe(
          mode === 'changed' && count % 2 === 0
            ? '/items/item-39%40+'
            : '/items/item-39@%2B',
        )
      }
      run()
      verify()
      bench('update and build 200 locations', run, {
        time: 1500,
        warmupTime: 500,
        throws: true,
        teardown: verify,
      })
    },
  )
}
