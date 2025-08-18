import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, RouterCore, notFound, redirect, } from '../src'
import type { RouteOptions } from '../src'

type AnyRouteOptions = RouteOptions<any>
type BeforeLoad = NonNullable<AnyRouteOptions['beforeLoad']>

describe('beforeLoad skip or exec', () => {
  const setup = ({ beforeLoad }: { beforeLoad?: BeforeLoad }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = new RouterCore({
      routeTree,
    })

    return router
  }

  test('nothing happens if nothing happens', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.load()
    expect(beforeLoad).toHaveBeenCalledTimes(0)
  })

  test('exec on regular nav', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.navigate({ to: '/foo' })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('skip if preload is ongoing', async () => {
    const beforeLoad = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    )
    const router = setup({ beforeLoad })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('skip if preload resolved successfully', async () => {
    const beforeLoad = vi.fn(() => Promise.resolve())
    const router = setup({ beforeLoad })
    await router.preloadRoute({ to: '/foo' })
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('exec if preload has rejected w/ notFound', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad
    })
    await router.preloadRoute({ to: '/foo' })
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if preload is pending, but will reject w/ notFound', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (preload) throw notFound()
    })
    const router = setup({
      beforeLoad
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if preload has rejected w/ redirect', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad
    })
    await router.preloadRoute({ to: '/foo' })
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if preload is pending, but will reject w/ redirect', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      beforeLoad
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if preload has rejected w/ regular Error', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad
    })
    await router.preloadRoute({ to: '/foo' })
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if preload is pending, but will reject w/ regular Error', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (preload) throw new Error('error')
    })
    const router = setup({
      beforeLoad
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })
})
