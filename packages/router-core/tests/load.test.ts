import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  notFound,
  redirect,
  rootRouteId,
} from '../src'
import type { RootRouteOptions } from '../src'

type AnyRouteOptions = RootRouteOptions<any>
type BeforeLoad = Extract<NonNullable<AnyRouteOptions['beforeLoad']>, Function>
type Loader = Extract<NonNullable<AnyRouteOptions['loader']>, Function>

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

describe('routeId in context options', () => {
  test('beforeLoad and context receive correct routeId for root route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: rootRouteId,
      }),
    )

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: rootRouteId,
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for child route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/foo',
      }),
    )

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/foo',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for nested route', async () => {
    const parentBeforeLoad = vi.fn()
    const parentContext = vi.fn()
    const childBeforeLoad = vi.fn()
    const childContext = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
      context: parentContext,
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      context: childContext,
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    expect(parentBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent',
      }),
    )
    expect(parentContext).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent',
      }),
    )
    expect(childBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent/child',
      }),
    )
    expect(childContext).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent/child',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for route with dynamic params', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([postRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/posts/$postId', params: { postId: '123' } })

    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/posts/$postId',
      }),
    )
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/posts/$postId',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for layout route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '/_layout',
      beforeLoad,
      context,
    })

    const indexRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
    })

    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/_layout',
      }),
    )
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/_layout',
      }),
    )
  })
})

describe('context semantics', () => {
  const setup = ({
    contextFn,
    loader,
    rootContextFn,
  }: {
    contextFn?: any
    loader?: any
    rootContextFn?: any
  }) => {
    const rootRoute = new BaseRootRoute({
      context: rootContextFn,
    })

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: contextFn,
      loader,
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

  test('context does not run when route is not visited', async () => {
    const contextFn = vi.fn()
    const router = setup({ contextFn })
    await router.load()
    expect(contextFn).toHaveBeenCalledTimes(0)
  })

  test('context runs on first navigation', async () => {
    const contextFn = vi.fn(() => ({ hello: 'world' }))
    const router = setup({ contextFn })
    await router.navigate({ to: '/foo' })
    expect(contextFn).toHaveBeenCalledTimes(1)
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
        }),
      ]),
    )
  })

  test('context does not re-run on stay navigation (same route, cached match)', async () => {
    const contextFn = vi.fn(() => ({ key: 'value' }))
    const loader = vi.fn()

    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo/$fooId',
      context: contextFn,
      loader,
      staleTime: 5000,
      gcTime: 5000,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      defaultStaleTime: 5000,
      defaultGcTime: 5000,
    })

    // First nav — context should run
    await router.navigate({
      to: '/foo/$fooId',
      params: { fooId: '1' },
    })
    expect(contextFn).toHaveBeenCalledTimes(1)

    // Navigate to same route with different params — this is a different matchId, new match
    await router.navigate({
      to: '/foo/$fooId',
      params: { fooId: '2' },
    })
    expect(contextFn).toHaveBeenCalledTimes(2)
  })

  test('context re-runs when a cached match is garbage collected and recreated', async () => {
    const contextFn = vi.fn(() => ({ key: 'value' }))

    // gcTime: 0 so matches are GC'd immediately after leaving
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: contextFn,
      gcTime: 0,
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

    // First nav — context runs
    await router.navigate({ to: '/foo' })
    expect(contextFn).toHaveBeenCalledTimes(1)

    // Navigate away — the /foo match should be GC'd with gcTime: 0
    await router.navigate({ to: '/bar' })

    // Wait for GC to happen
    await sleep(50)

    // Navigate back — new match created, context runs again
    await router.navigate({ to: '/foo' })
    expect(contextFn).toHaveBeenCalledTimes(2)
  })

  test('context is async (returned promise is awaited)', async () => {
    const callOrder: Array<string> = []
    const contextFn = vi.fn(async () => {
      await sleep(50)
      callOrder.push('context')
      return { fromContext: true }
    })
    const loader = vi.fn(() => {
      callOrder.push('loader')
    })
    const router = setup({ contextFn, loader })
    await router.navigate({ to: '/foo' })

    expect(callOrder).toEqual(['context', 'loader'])
    expect(contextFn).toHaveBeenCalledTimes(1)
  })

  test('context receives params, context, routeId, cause, preload but NOT search or deps', async () => {
    const contextFn = vi.fn()
    const rootContextFn = vi.fn(() => ({ rootCtx: 'hello' }))

    const rootRoute = new BaseRootRoute({
      context: rootContextFn,
    })

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo/$fooId',
      context: contextFn,
      validateSearch: () => ({ page: 1 }),
      loaderDeps: (deps: any) => ({ page: deps.search.page }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      context: { routerCtx: 'test' } as any,
    })

    await router.navigate({
      to: '/foo/$fooId',
      params: { fooId: '123' },
    })

    expect(contextFn).toHaveBeenCalledTimes(1)
    const args = contextFn.mock.calls[0]![0]
    expect(args.params).toEqual({ fooId: '123' })
    expect(args.context).toEqual({ routerCtx: 'test', rootCtx: 'hello' })
    expect(args.routeId).toBe('/foo/$fooId')
    // context does NOT receive deps or search
    expect(args.deps).toBeUndefined()
    expect(args.cause).toBe('enter')
    expect(args.preload).toBe(false)
    expect(args.search).toBeUndefined()
  })

  test('context return value is stored in match context', async () => {
    const contextFn = vi.fn(() => ({ fromContext: 'data' }))
    const loader = vi.fn()
    const router = setup({ contextFn, loader })
    await router.navigate({ to: '/foo' })

    // The loader should have access to the context return
    expect(loader).toHaveBeenCalledTimes(1)
    const loaderArgs = loader.mock.calls[0]![0]
    expect(loaderArgs.context).toEqual({ fromContext: 'data' })
  })

  test('context (without invalidate) does NOT re-run after router.invalidate()', async () => {
    const contextFn = vi.fn(() => ({ data: 'fresh' }))
    const loader = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: contextFn,
      loader,
      staleTime: 5000,
      gcTime: 5000,
    })
    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      defaultStaleTime: 5000,
      defaultGcTime: 5000,
    })

    // Navigate to /foo — context runs once
    await router.navigate({ to: '/foo' })
    expect(contextFn).toHaveBeenCalledTimes(1)

    // Invalidate and reload — context should NOT re-run (no invalidate flag)
    await router.invalidate()
    expect(contextFn).toHaveBeenCalledTimes(1)
  })
})

describe('context with invalidate semantics', () => {
  const setup = ({
    contextFn,
    loader,
    staleTime,
  }: {
    contextFn?: any
    loader?: any
    staleTime?: number
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: contextFn,
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

  test('context with invalidate:true does not run when route is not visited', async () => {
    const handler = vi.fn()
    const router = setup({ contextFn: { handler, invalidate: true } })
    await router.load()
    expect(handler).toHaveBeenCalledTimes(0)
  })

  test('context with invalidate:true runs on first navigation', async () => {
    const handler = vi.fn(() => ({ loaded: true }))
    const router = setup({ contextFn: { handler, invalidate: true } })
    await router.navigate({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('context with invalidate:true return value extends context available in loader', async () => {
    const handler = vi.fn(() => ({ fromContext: 'loadData' }))
    const loader = vi.fn()
    const router = setup({ contextFn: { handler, invalidate: true }, loader })
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
    const loaderArgs = loader.mock.calls[0]![0]
    expect(loaderArgs.context).toEqual({ fromContext: 'loadData' })
  })

  test('context with invalidate:true is async (returned promise is awaited)', async () => {
    const callOrder: Array<string> = []
    const handler = vi.fn(async () => {
      await sleep(50)
      callOrder.push('context')
      return { fromContext: true }
    })
    const loader = vi.fn(() => {
      callOrder.push('loader')
    })
    const router = setup({ contextFn: { handler, invalidate: true }, loader })
    await router.navigate({ to: '/foo' })

    // context completes before loader starts (serial then parallel)
    expect(callOrder).toEqual(['context', 'loader'])
  })

  test('context with invalidate:true does not re-run on cached match (not invalid)', async () => {
    const handler = vi.fn(() => ({ data: 'fresh' }))
    const loader = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: { handler, invalidate: true },
      loader,
      gcTime: 5000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })
    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      defaultGcTime: 5000,
    })

    // Navigate to /foo — context runs
    await router.navigate({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(1)

    // Navigate away to /bar
    await router.navigate({ to: '/bar' })

    // Navigate back to /foo — context should skip
    // because needsContext was consumed on first run and match is not invalid
    await router.navigate({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('context with invalidate:true re-runs after router.invalidate()', async () => {
    const handler = vi.fn(() => ({ data: 'fresh' }))
    const loader = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: { handler, invalidate: true },
      loader,
      staleTime: 5000,
      gcTime: 5000,
    })
    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      defaultStaleTime: 5000,
      defaultGcTime: 5000,
    })

    // Navigate to /foo — context runs once
    await router.navigate({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(1)

    // Invalidate and reload — context should re-run (invalidate: true)
    await router.invalidate()
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('context with invalidate:true re-runs when loaderDeps change (new match)', async () => {
    const handler = vi.fn()

    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        page: Number(search.page) || 1,
      }),
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loaderDeps: (deps: any) => ({ page: deps.search.page }),
      context: { handler, invalidate: true },
      gcTime: 10_000,
    })
    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: 1 } })
    expect(handler).toHaveBeenCalledTimes(1)

    // Navigate with different loaderDeps — new matchId, new match → context runs
    await router.navigate({ to: '/foo', search: { page: 2 } })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('context with invalidate:true does not re-run on stale cached match (only on invalid)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))

    const handler = vi.fn(() => ({ loaded: true }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: { handler, invalidate: true },
      gcTime: 60_000,
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

    await router.navigate({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/bar' })

    // Advance time — staleness is irrelevant for context with invalidate
    vi.setSystemTime(new Date('2020-01-01T00:01:00.000Z'))
    await router.navigate({ to: '/foo' })

    // context should NOT re-run — needsContext was consumed, not invalid
    expect(handler).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  test('context with invalidate:true re-runs when match is GC-ed and re-created', async () => {
    const handler = vi.fn(() => ({ loaded: true }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: { handler, invalidate: true },
      gcTime: 0,
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

    await router.navigate({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(1)

    // Navigate away — the /foo match should be GC'd with gcTime: 0
    await router.navigate({ to: '/bar' })

    // Wait for GC to happen
    await sleep(50)

    // Navigate back — new match created, context runs again
    await router.navigate({ to: '/foo' })

    // context re-runs because the match was GC-ed and a fresh match was created
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('context does not run during preload when route.preload=false', async () => {
    const handler = vi.fn(() => ({ loaded: true }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: { handler, invalidate: true },
      preload: false,
    })
    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/foo' })
    expect(handler).toHaveBeenCalledTimes(0)
  })

  test('context return is inherited by child routes', async () => {
    const rootContextFn = vi.fn(() => ({ fromRoot: 'rootData' }))
    const childLoader = vi.fn()

    const rootRoute = new BaseRootRoute({
      context: rootContextFn,
    })

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: childLoader,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    expect(rootContextFn).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)
    const childLoaderArgs = childLoader.mock.calls[0]![0]
    expect(childLoaderArgs.context).toEqual({ fromRoot: 'rootData' })
  })
})

describe('per-route interleaved ordering', () => {
  test('Parent(context→beforeLoad) → Child(context→beforeLoad) → loaders parallel', async () => {
    const callOrder: Array<string> = []

    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: vi.fn(() => {
        callOrder.push('parent:context')
        return { parentContext: true }
      }),
      beforeLoad: vi.fn(() => {
        callOrder.push('parent:beforeLoad')
        return { parentBeforeLoad: true }
      }),
      loader: vi.fn(() => {
        callOrder.push('parent:loader')
      }),
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      context: vi.fn(() => {
        callOrder.push('child:context')
        return { childContext: true }
      }),
      beforeLoad: vi.fn(() => {
        callOrder.push('child:beforeLoad')
        return { childBeforeLoad: true }
      }),
      loader: vi.fn(() => {
        callOrder.push('child:loader')
      }),
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    // Serial per-route: parent's context → beforeLoad, then child's context → beforeLoad
    // Then loaders run in parallel
    expect(callOrder.slice(0, 4)).toEqual([
      'parent:context',
      'parent:beforeLoad',
      'child:context',
      'child:beforeLoad',
    ])

    // Both loaders should have run (after the serial phase)
    expect(callOrder).toContain('parent:loader')
    expect(callOrder).toContain('child:loader')
    expect(callOrder.indexOf('parent:loader')).toBeGreaterThanOrEqual(4)
    expect(callOrder.indexOf('child:loader')).toBeGreaterThanOrEqual(4)
  })

  test('async context and beforeLoad are awaited in order', async () => {
    const callOrder: Array<string> = []

    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: vi.fn(async () => {
        await sleep(20)
        callOrder.push('parent:context')
        return { parentContext: true }
      }),
      beforeLoad: vi.fn(async () => {
        await sleep(20)
        callOrder.push('parent:beforeLoad')
        return { parentBeforeLoad: true }
      }),
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      context: vi.fn(async () => {
        await sleep(20)
        callOrder.push('child:context')
        return { childContext: true }
      }),
      beforeLoad: vi.fn(async () => {
        await sleep(20)
        callOrder.push('child:beforeLoad')
        return { childBeforeLoad: true }
      }),
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    expect(callOrder).toEqual([
      'parent:context',
      'parent:beforeLoad',
      'child:context',
      'child:beforeLoad',
    ])
  })
})

describe('full context accumulation chain', () => {
  test('routerContext + parent context + parent beforeLoad + child context + child beforeLoad → available in child loader', async () => {
    const childLoader = vi.fn()

    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: () => ({ parentContext: 'a' }),
      beforeLoad: () => ({ parentBeforeLoad: 'b' }),
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      context: () => ({ childContext: 'd' }),
      beforeLoad: () => ({ childBeforeLoad: 'e' }),
      loader: childLoader,
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      context: { routerCtx: 'base' } as any,
    })

    await router.navigate({ to: '/parent/child' })

    expect(childLoader).toHaveBeenCalledTimes(1)
    const loaderCtx = childLoader.mock.calls[0]![0].context
    expect(loaderCtx).toEqual({
      routerCtx: 'base',
      parentContext: 'a',
      parentBeforeLoad: 'b',
      childContext: 'd',
      childBeforeLoad: 'e',
    })
  })

  test('context flows correctly through context → beforeLoad within a single route', async () => {
    const beforeLoad = vi.fn()
    const loader = vi.fn()

    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: () => ({ fromContext: 'match' }),
      beforeLoad: (opts: any) => {
        beforeLoad(opts)
        return { fromBeforeLoad: 'bl' }
      },
      loader,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
      context: { base: 'ctx' } as any,
    })

    await router.navigate({ to: '/foo' })

    // beforeLoad should see: base + context return
    const blCtx = beforeLoad.mock.calls[0]![0].context
    expect(blCtx).toEqual({ base: 'ctx', fromContext: 'match' })

    // loader should see: base + context + beforeLoad
    const lCtx = loader.mock.calls[0]![0].context
    expect(lCtx).toEqual({
      base: 'ctx',
      fromContext: 'match',
      fromBeforeLoad: 'bl',
    })
  })

  test('overlapping context keys: later lifecycle overrides earlier', async () => {
    const loader = vi.fn()

    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      context: () => ({ shared: 'from-context', contextOnly: true }),
      beforeLoad: () => ({ shared: 'from-beforeLoad', beforeLoadOnly: true }),
      loader,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })

    const lCtx = loader.mock.calls[0]![0].context
    // beforeLoad runs last, so 'shared' should be 'from-beforeLoad'
    expect(lCtx.shared).toBe('from-beforeLoad')
    expect(lCtx.contextOnly).toBe(true)
    expect(lCtx.beforeLoadOnly).toBe(true)
  })

  test('child context sees parent full context (context + beforeLoad)', async () => {
    const childContextFn = vi.fn()

    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: () => ({ pContext: 1 }),
      beforeLoad: () => ({ pBeforeLoad: 2 }),
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      context: childContextFn,
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    expect(childContextFn).toHaveBeenCalledTimes(1)
    const childCtx = childContextFn.mock.calls[0]![0].context
    expect(childCtx).toEqual({
      pContext: 1,
      pBeforeLoad: 2,
    })
  })

  test('child beforeLoad sees parent full context + child context return', async () => {
    const childBeforeLoad = vi.fn()

    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: () => ({ pContext: 1 }),
      beforeLoad: () => ({ pBeforeLoad: 2 }),
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      context: () => ({ cContext: 4 }),
      beforeLoad: childBeforeLoad,
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    expect(childBeforeLoad).toHaveBeenCalledTimes(1)
    const ctx = childBeforeLoad.mock.calls[0]![0].context
    expect(ctx).toEqual({
      pContext: 1,
      pBeforeLoad: 2,
      cContext: 4,
    })
  })
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
