import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

describe('callbacks', () => {
  const setup = ({
    onEnter,
    onLeave,
    onStay,
  }: {
    onEnter?: () => void
    onLeave?: () => void
    onStay?: () => void
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      onLeave,
      onEnter,
      onStay,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      onLeave,
      onEnter,
      onStay,
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    return router
  }

  const setupWithLoaderDeps = ({
    onEnter,
    onLeave,
    onStay,
  }: {
    onEnter?: () => void
    onLeave?: () => void
    onStay?: () => void
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
      onLeave,
      onEnter,
      onStay,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    return router
  }
  describe('onEnter', () => {
    it('runs on navigate to a new route', async () => {
      const onEnter = vi.fn()
      const router = setup({ onEnter })

      // Entering foo
      await router.navigate({ to: '/foo' })
      expect(onEnter).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: '/foo/foo' }),
      )

      // Entering bar
      await router.navigate({ to: '/bar' })
      expect(onEnter).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: '/bar/bar' }),
      )
    })
  })

  describe('onLeave', () => {
    it('runs on navigate from a previous route', async () => {
      const onLeave = vi.fn()
      const router = setup({ onLeave })
      await router.navigate({ to: '/foo' })

      // Leaving foo to bar
      await router.navigate({ to: '/bar' })
      expect(onLeave).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: '/foo/foo' }),
      )

      // Leaving bar to foo
      await router.navigate({ to: '/foo' })
      expect(onLeave).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: '/bar/bar' }),
      )
    })
  })

  describe('onStay', () => {
    it('runs on navigate to the same route', async () => {
      const onStay = vi.fn()
      const router = setup({ onStay })
      await router.navigate({ to: '/foo' })

      // Staying on foo
      await router.navigate({ to: '/foo', search: { foo: 'baz' } })
      expect(onStay).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: '/foo/foo', search: { foo: 'baz' } }),
      )

      // Staying on foo
      await router.navigate({ to: '/foo', search: { foo: 'quux' } })
      expect(onStay).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: '/foo/foo', search: { foo: 'quux' } }),
      )
    })

    it('runs instead of onLeave/onEnter when loaderDeps change from search param updates', async () => {
      const onEnter = vi.fn()
      const onLeave = vi.fn()
      const onStay = vi.fn()
      const router = setupWithLoaderDeps({ onEnter, onLeave, onStay })

      // Navigate to foo — onEnter should fire
      await router.navigate({ to: '/foo', search: { page: '1' } })
      expect(onEnter).toHaveBeenCalledTimes(1)
      expect(onLeave).toHaveBeenCalledTimes(0)
      expect(onStay).toHaveBeenCalledTimes(0)

      // Update search param that's in loaderDeps — onStay should fire, not onLeave+onEnter
      await router.navigate({ to: '/foo', search: { page: '2' } })
      expect(onEnter).toHaveBeenCalledTimes(1) // no new onEnter
      expect(onLeave).toHaveBeenCalledTimes(0) // no onLeave
      expect(onStay).toHaveBeenCalledTimes(1) // onStay fires

      // Update again — onStay fires again
      await router.navigate({ to: '/foo', search: { page: '3' } })
      expect(onEnter).toHaveBeenCalledTimes(1)
      expect(onLeave).toHaveBeenCalledTimes(0)
      expect(onStay).toHaveBeenCalledTimes(2)
    })
  })
})
