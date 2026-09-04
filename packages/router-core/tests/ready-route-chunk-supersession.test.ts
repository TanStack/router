import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test.each(['undefined', 'pending promise'] as const)(
  'navigation inside component preload supersedes its load when preload returns %s',
  async (result) => {
    const chunk = createControlledPromise<void>()
    const started = createControlledPromise<void>()
    const onError = vi.fn()
    const onEnter = vi.fn()
    let winner: Promise<void> | undefined
    let router: ReturnType<typeof createTestRouter>
    const preload = vi.fn(() => {
      winner = router.navigate({ to: '/winner' })
      started.resolve()
      return result === 'pending promise' ? chunk : undefined
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const abandonedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/abandoned',
      component: Object.assign(() => null, { preload }),
      onError,
      onEnter,
    })
    const winnerRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/winner',
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        abandonedRoute,
        winnerRoute,
      ]),
      history,
    })

    try {
      await router.load()
      let abandonedSettled = false
      const abandoned = router.navigate({ to: '/abandoned' }).then(() => {
        abandonedSettled = true
      })
      await started
      expect(winner).toBeDefined()
      await winner
      await vi.waitFor(() => expect(abandonedSettled).toBe(true))
      await abandoned

      expect(preload).toHaveBeenCalledOnce()
      expect(router.state.location.pathname).toBe('/winner')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: winnerRoute.id,
        status: 'success',
      })
      expect(onEnter).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      if (result === 'pending promise') {
        expect(chunk.status).toBe('pending')
        chunk.reject(new Error('obsolete component chunk failed'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(router.state.location.pathname).toBe('/winner')
        expect(router.state.matches.at(-1)).toMatchObject({
          routeId: winnerRoute.id,
          status: 'success',
        })
        expect(onEnter).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
      }
    } finally {
      chunk.resolve()
      history.destroy()
    }
  },
)
