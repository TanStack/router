import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

const pendingGates: Array<ReturnType<typeof createControlledPromise<void>>> = []
const pendingLoads: Array<Promise<unknown>> = []

afterEach(async () => {
  for (const gate of pendingGates) {
    gate.resolve()
  }

  await Promise.allSettled(pendingLoads)

  pendingGates.length = 0
  pendingLoads.length = 0
})

describe('route boundary component preloads', () => {
  test('a late normal component chunk cannot replace a selected not-found boundary', async () => {
    const componentGate = createControlledPromise<void>()
    const notFoundGate = createControlledPromise<void>()
    const notFoundPreload = vi.fn(() => notFoundGate)
    pendingGates.push(componentGate, notFoundGate)

    const ParentComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })
    const NotFoundBoundary = Object.assign(() => null, {
      preload: notFoundPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'ready',
      component: ParentComponent as any,
      notFoundComponent: NotFoundBoundary as any,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: () => {
        throw notFound({ routeId: parentRoute.id })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    const loading = router.load()
    pendingLoads.push(loading)
    await vi.waitFor(() => expect(notFoundPreload).toHaveBeenCalledOnce())

    componentGate.resolve()
    await Promise.resolve()
    notFoundGate.resolve()
    await loading

    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'notFound',
      loaderData: 'ready',
    })
  })
})
