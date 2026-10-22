import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

for (const callable of [false, true]) {
  test.each([
    ['beforeLoad', false],
    ['beforeLoad', true],
    ['loader', false],
    ['loader', true],
  ] as const)(
    `a synchronously thrown %s Promise has the same meaning with isServer=%s (callable: ${callable})`,
    async (hook, isServer) => {
      const promise = Promise.resolve('not loader data')
      const thrown = callable
        ? Object.assign(() => undefined, { then: promise.then.bind(promise) })
        : promise
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        beforeLoad:
          hook === 'beforeLoad'
            ? () => {
                throw thrown
              }
            : undefined,
        loader:
          hook === 'loader'
            ? () => {
                throw thrown
              }
            : undefined,
        onError,
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
        isServer,
      })

      if (isServer) {
        const response = await loadServerResponse(router, '/target')
        expect(response.status).toBe(500)
      } else {
        await router.load()
      }

      const error = router.state.matches.at(-1)?.error
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: targetRoute.id,
        status: 'error',
      })
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).cause).toBe(thrown)
      expect(onError).toHaveBeenCalledWith(error)
    },
  )
}
