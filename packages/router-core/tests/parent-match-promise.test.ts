import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test.each([false, true])(
  'parentMatchPromise exposes successful parent state during loading with isServer=%s',
  async (isServer) => {
    const seen: Array<unknown> = []
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'parent data',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async ({ parentMatchPromise }) => {
        seen.push(await parentMatchPromise)
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer,
    })

    await router.load()

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      routeId: parentRoute.id,
      loaderData: 'parent data',
      status: 'success',
      invalid: false,
      preload: false,
      isFetching: false,
    })
  },
)

test('server parentMatchPromise exposes the error selected by onError', async () => {
  const original = new Error('original')
  const selected = new Error('selected')
  let seen: unknown
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => {
      throw original
    },
    onError: () => {
      throw selected
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async ({ parentMatchPromise }) => {
      seen = await parentMatchPromise
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    isServer: true,
  })

  await router.load()

  expect(seen).toMatchObject({
    routeId: parentRoute.id,
    status: 'error',
    error: selected,
  })
})
