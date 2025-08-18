import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

describe('beforeLoad skip or exec', () => {
  test('current behavior', async () => {
    const rootRoute = new BaseRootRoute({})
    const beforeLoad = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    )
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
    })
    const routeTree = rootRoute.addChildren([fooRoute])
    const router = new RouterCore({
      routeTree,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })
})
