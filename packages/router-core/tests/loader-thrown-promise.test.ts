import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each([false, true])(
  'a synchronously thrown loader Promise has the same meaning with isServer=%s',
  async (isServer) => {
    const thrown = Promise.resolve('not loader data')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: () => {
        throw thrown
      },
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

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'error',
      error: thrown,
    })
    expect(onError).toHaveBeenCalledWith(thrown)
  },
)
