import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  notFound,
  redirect,
} from '../src'
import type { RootRouteOptions } from '../src'

type AnyRouteOptions = RootRouteOptions<any>
type BeforeLoad = NonNullable<AnyRouteOptions['beforeLoad']>
type Loader = NonNullable<AnyRouteOptions['loader']>

describe('redirect resolution', () => {
  test('resolveRedirect normalizes same-origin Location to path-only', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://example.com/foo'],
      }),
      origin: 'https://example.com',
    })

    // This redirect already includes an absolute Location header (external-ish),
    // but still represents an internal navigation.
    const unresolved = redirect({
      to: '/foo',
      headers: { Location: 'https://example.com/foo' },
    })

    const resolved = router.resolveRedirect(unresolved)

    // Expect Location and stored href to be path-only (no origin).
    expect(resolved.headers.get('Location')).toBe('/foo')
    expect(resolved.options.href).toBe('/foo')
  })
})

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
      history: createMemoryHistory(),
    })

    return router
  }

  test('baseline', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.load()
    expect(beforeLoad).toHaveBeenCalledTimes(0)
  })

  test('exec on regular nav', async () => {
    const beforeLoad = vi.fn(() => Promise.resolve({ hello: 'world' }))
    const router = setup({ beforeLoad })
    const navigation = router.navigate({ to: '/foo' })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(router.state.pendingMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await navigation
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          context: {
            hello: 'world',
          },
        }),
      ]),
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('exec if resolved preload (success)', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.preloadRoute({ to: '/foo' })
    expect(router.state.cachedMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (success)', async () => {
    const beforeLoad = vi.fn(() => sleep(100))
    const router = setup({ beforeLoad })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    expect(router.state.cachedMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (notFound)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (notFound)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw notFound()
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (redirect)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (redirect)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (error)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (error)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw new Error('error')
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })
})

describe('loader skip or exec', () => {
  const setup = ({
    loader,
    staleTime,
  }: {
    loader?: Loader
    staleTime?: number
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime,
      gcTime: staleTime,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    return router
  }

  test('baseline', async () => {
    const loader = vi.fn()
    const router = setup({ loader })
    await router.load()
    expect(loader).toHaveBeenCalledTimes(0)
  })

  test('exec on regular nav', async () => {
    const loader = vi.fn(() => Promise.resolve({ hello: 'world' }))
    const router = setup({ loader })
    const navigation = router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.pendingMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await navigation
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          loaderData: {
            hello: 'world',
          },
        }),
      ]),
    )
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if resolved preload (success)', async () => {
    const loader = vi.fn()
    const router = setup({ loader })
    await router.preloadRoute({ to: '/foo' })
    expect(router.state.cachedMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('skip if resolved preload (success) within staleTime duration', async () => {
    const loader = vi.fn()
    const router = setup({ loader, staleTime: 1000 })
    await router.preloadRoute({ to: '/foo' })
    expect(router.state.cachedMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('skip if pending preload (success)', async () => {
    const loader = vi.fn(() => sleep(100))
    const router = setup({ loader })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    expect(router.state.cachedMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if rejected preload (notFound)', async () => {
    const loader = vi.fn<Loader>(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('skip if pending preload (notFound)', async () => {
    const loader = vi.fn<Loader>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw notFound()
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if rejected preload (redirect)', async () => {
    const loader = vi.fn<Loader>(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('skip if pending preload (redirect)', async () => {
    const loader = vi.fn<Loader>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/bar')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if rejected preload (error)', async () => {
    const loader = vi.fn<Loader>(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('skip if pending preload (error)', async () => {
    const loader = vi.fn<Loader>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw new Error('error')
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
  })
})

test('exec on stay (beforeLoad & loader)', async () => {
  let rootBeforeLoadResolved = false
  const rootBeforeLoad = vi.fn(async () => {
    await sleep(10)
    rootBeforeLoadResolved = true
  })
  const rootLoader = vi.fn(() => sleep(10))
  const rootRoute = new BaseRootRoute({
    beforeLoad: rootBeforeLoad,
    loader: rootLoader,
  })

  let layoutBeforeLoadResolved = false
  const layoutBeforeLoad = vi.fn(async () => {
    await sleep(10)
    layoutBeforeLoadResolved = true
  })
  const layoutLoader = vi.fn(() => sleep(10))
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    beforeLoad: layoutBeforeLoad,
    loader: layoutLoader,
    id: '/_layout',
  })

  const fooRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/foo',
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/bar',
  })

  const routeTree = rootRoute.addChildren([
    layoutRoute.addChildren([fooRoute, barRoute]),
  ])

  const router = new RouterCore({
    routeTree,
    history: createMemoryHistory(),
    defaultStaleTime: 1000,
    defaultGcTime: 1000,
  })

  await router.navigate({ to: '/foo' })
  expect(router.state.location.pathname).toBe('/foo')

  rootBeforeLoadResolved = false
  layoutBeforeLoadResolved = false
  vi.clearAllMocks()

  /*
   * When navigating between sibling routes,
   * do the parent routes get re-executed?
   */

  await router.navigate({ to: '/bar' })
  expect(router.state.location.pathname).toBe('/bar')

  // beforeLoads always re-execute
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(layoutBeforeLoad).toHaveBeenCalledTimes(1)

  // beforeLoads are called in order
  expect(rootBeforeLoad.mock.invocationCallOrder[0]).toBeLessThan(
    layoutBeforeLoad.mock.invocationCallOrder[0]!,
  )

  // loaders are skipped because of staleTime
  expect(rootLoader).toHaveBeenCalledTimes(0)
  expect(layoutLoader).toHaveBeenCalledTimes(0)

  // beforeLoad calls were correctly awaited
  expect(rootBeforeLoadResolved).toBe(true)
  expect(layoutBeforeLoadResolved).toBe(true)
})

test('cancelMatches after pending timeout', async () => {
  const WAIT_TIME = 5
  const onAbortMock = vi.fn()
  const rootRoute = new BaseRootRoute({})
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    pendingMs: WAIT_TIME * 20,
    loader: async ({ abortController }) => {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          resolve()
        }, WAIT_TIME * 40)
        abortController.signal.addEventListener('abort', () => {
          onAbortMock()
          clearTimeout(timer)
          resolve()
        })
      })
    },
    pendingComponent: {},
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
  })
  const routeTree = rootRoute.addChildren([fooRoute, barRoute])
  const router = new RouterCore({ routeTree, history: createMemoryHistory() })

  await router.load()
  router.navigate({ to: '/foo' })
  await sleep(WAIT_TIME * 30)

  // At this point, pending timeout should have triggered
  const fooMatch = router.getMatch('/foo/foo')
  expect(fooMatch).toBeDefined()

  // Navigate away, which should cancel the pending match
  await router.navigate({ to: '/bar' })
  await router.latestLoadPromise

  expect(router.state.location.pathname).toBe('/bar')

  // Verify that abort was called and pending timeout was cleared
  expect(onAbortMock).toHaveBeenCalled()
  const cancelledFooMatch = router.getMatch('/foo/foo')
  expect(cancelledFooMatch?._nonReactive.pendingTimeout).toBeUndefined()
})

describe('params.parse notFound', () => {
  test('throws notFound on invalid params', async () => {
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test/$id',
      params: {
        parse: ({ id }: { id: string }) => {
          const parsed = parseInt(id, 10)
          if (Number.isNaN(parsed)) {
            throw notFound()
          }
          return { id: parsed }
        },
      },
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test/invalid'] }),
    })

    await router.load()

    const match = router.state.pendingMatches?.find(
      (m) => m.routeId === testRoute.id,
    )

    expect(match?.status).toBe('notFound')
  })

  test('succeeds on valid params', async () => {
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test/$id',
      params: {
        parse: ({ id }: { id: string }) => {
          const parsed = parseInt(id, 10)
          if (Number.isNaN(parsed)) {
            throw notFound()
          }
          return { id: parsed }
        },
      },
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test/123'] }),
    })

    await router.load()

    const match = router.state.matches.find((m) => m.routeId === testRoute.id)
    expect(match?.status).toBe('success')
    expect(router.state.statusCode).toBe(200)
  })
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
