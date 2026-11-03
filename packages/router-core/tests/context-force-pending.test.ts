import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

for (const lifecycle of ['context', 'revalidate', 'beforeLoad'] as const) {
  test.each([false, true])(
    `${lifecycle} revalidation respects forcePending: %s`,
    async (forcePending) => {
      const entered = createControlledPromise<void>()
      const release = createControlledPromise<{ generation: number }>()
      const handler = vi.fn(() => {
        if (handler.mock.calls.length === 1) {
          return { generation: 1 }
        }
        entered.resolve()
        return release
      })
      const root = new BaseRootRoute({})
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        context:
          lifecycle === 'beforeLoad'
            ? undefined
            : {
                handler,
                revalidate: lifecycle === 'revalidate' ? handler : true,
              },
        beforeLoad: lifecycle === 'beforeLoad' ? handler : undefined,
        pendingComponent: () => null,
        pendingMs: 0,
        pendingMinMs: 0,
      })
      const router = createTestRouter({
        routeTree: root.addChildren([page]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      await router.load()
      const invalidation = router.invalidate({ forcePending })
      try {
        await entered
        await new Promise((resolve) => setTimeout(resolve))
        expect(router.state.isLoading).toBe(true)
        expect(router.state.matches.at(-1)).toMatchObject({
          status: forcePending ? 'pending' : 'success',
          isFetching: 'beforeLoad',
        })
        release.resolve({ generation: 2 })
        await invalidation
        expect(handler).toHaveBeenCalledTimes(2)
        expect(router.state.matches.at(-1)).toMatchObject({
          status: 'success',
          context: { generation: 2 },
        })
      } finally {
        release.resolve({ generation: 2 })
        await invalidation
        router.clearCache()
        router.history.destroy()
      }
    },
  )
}
