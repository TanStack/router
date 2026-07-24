import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

describe('preloaded loader reuse with fresh beforeLoad context', () => {
  test('reruns nested context for navigation while reusing loader data', async () => {
    const parentBeforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      parent: preload ? 'preloaded parent' : 'loaded parent',
    }))
    const childBeforeLoad = vi.fn(
      ({
        context,
        preload,
      }: {
        context: { parent: string }
        preload: boolean
      }) => ({
        child: `${context.parent}:${preload}`,
      }),
    )
    const childLoader = vi.fn(
      ({
        context,
        preload,
      }: {
        context: { parent: string; child: string }
        preload: boolean
      }) => ({ context, preload }),
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      staleTime: Infinity,
      beforeLoad: parentBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      staleTime: Infinity,
      beforeLoad: childBeforeLoad,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' })
    await router.navigate({ to: '/parent/child' })

    expect(parentBeforeLoad).toHaveBeenCalledTimes(2)
    expect(parentBeforeLoad).toHaveBeenLastCalledWith(
      expect.objectContaining({ preload: false }),
    )
    expect(childBeforeLoad).toHaveBeenCalledTimes(2)
    expect(childBeforeLoad).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ parent: 'loaded parent' }),
        preload: false,
      }),
    )
    expect(childLoader).toHaveBeenCalledTimes(1)
    const match = router.state.matches.find(
      (candidate) => candidate.routeId === childRoute.id,
    )
    expect(match?.context).toEqual({
      parent: 'loaded parent',
      child: 'loaded parent:false',
    })
    expect(match?.loaderData).toEqual({
      context: {
        parent: 'preloaded parent',
        child: 'preloaded parent:true',
      },
      preload: true,
    })
  })

  test.each([
    { age: 50, expected: [false, true, false], guard: 'loaded' },
    { age: 100, expected: [false, true, false], guard: 'loaded' },
  ])(
    'reruns completed beforeLoad while retaining navigation-owned loader data at age $age',
    async ({ age, expected, guard }) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
        guard: preload ? 'preloaded' : 'loaded',
      }))
      const loader = vi.fn(({ preload }: { preload: boolean }) => preload)
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const guardedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/guarded',
        staleTime: Infinity,
        preloadStaleTime: 100,
        beforeLoad,
        shouldReload: false,
        loader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      await router.navigate({ to: '/guarded' })
      await router.navigate({ to: '/' })
      vi.setSystemTime(5_000)
      await router.preloadRoute({ to: '/guarded' })
      vi.setSystemTime(5_000 + age)
      await router.navigate({ to: '/guarded' })

      expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual(
        expected,
      )
      expect(loader.mock.calls.map(([context]) => context.preload)).toEqual([
        false,
      ])
      expect(router.state.matches.at(-1)?.context).toEqual({ guard })
    },
  )

  test('does not cache beforeLoad-only context across an unrelated navigation', async () => {
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      guard: preload ? 'preloaded' : 'loaded',
    }))
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      preloadStaleTime: Infinity,
      preloadGcTime: Infinity,
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, otherRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/guarded' })
    await router.navigate({ to: '/other' })
    await router.navigate({ to: '/guarded' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(router.state.matches.at(-1)?.context).toEqual({
      guard: 'loaded',
    })
  })

  test('does not reuse child context under a different parent match', async () => {
    const childBeforeLoad = vi.fn(
      ({
        context,
        preload,
      }: {
        context: { version: number }
        preload: boolean
      }) => ({
        childVersion: context.version,
      }),
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
      loaderDeps: ({ search }) => ({
        version: search.version,
      }),
      context: ({ deps }: { deps: { version: number } }) => ({
        version: deps.version,
      }),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      preloadStaleTime: Infinity,
      beforeLoad: childBeforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/parent/child',
      search: { version: 1 },
    })
    await router.navigate({
      to: '/parent/child',
      search: { version: 2 },
    })

    expect(
      childBeforeLoad.mock.calls.map(([context]) => context.preload),
    ).toEqual([true, false])
    expect(router.state.matches.at(-1)?.context).toEqual({
      version: 2,
      childVersion: 2,
    })
  })

  test('reruns beforeLoad when the completed preload reaches its stale boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const seen: Array<boolean> = []
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      staleTime: Infinity,
      preloadStaleTime: 100,
      beforeLoad: ({ preload }) => {
        seen.push(preload)
        return { generation: preload ? 'preload' : 'navigation' }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/guarded' })
    vi.setSystemTime(1_100)
    await router.navigate({ to: '/guarded' })

    expect(seen).toEqual([true, false])
    expect(router.state.matches.at(-1)?.context).toEqual({
      generation: 'navigation',
    })
  })

  test('reruns descendant context after an ancestor becomes stale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const parentSeen: Array<boolean> = []
    const childSeen: Array<boolean> = []
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      staleTime: Infinity,
      preloadStaleTime: 100,
      beforeLoad: ({ preload }) => {
        parentSeen.push(preload)
        return { parent: preload ? 'preloaded parent' : 'loaded parent' }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      staleTime: Infinity,
      preloadStaleTime: 1_000,
      beforeLoad: ({ context, preload }) => {
        childSeen.push(preload)
        return { child: `${context.parent}:${preload}` }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' })
    vi.setSystemTime(1_100)
    await router.navigate({ to: '/parent/child' })

    expect(parentSeen).toEqual([true, false])
    expect(childSeen).toEqual([true, false])
    expect(router.state.matches.at(-1)?.context).toEqual({
      parent: 'loaded parent',
      child: 'loaded parent:false',
    })
  })

  test('invalidation prevents reuse of completed preload context', async () => {
    const seen: Array<boolean> = []
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      staleTime: Infinity,
      beforeLoad: ({ preload }) => {
        seen.push(preload)
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/guarded' })
    await router.invalidate({
      filter: (match) => match.routeId === guardedRoute.id,
    })
    await router.navigate({ to: '/guarded' })

    expect(seen).toEqual([true, false])
  })

  test('invalidation prevents adoption of context from an active preload', async () => {
    const loaderGate = createControlledPromise<string>()
    let generation = 1
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      generation,
      preload,
    }))
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/guarded' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    generation = 2
    await router.invalidate()
    const navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    loaderGate.resolve('shared loader data')
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)?.context).toEqual({
      generation: 2,
      preload: false,
    })
    expect(router.state.matches.at(-1)?.loaderData).toBe('shared loader data')
  })

  test('preload false does not cache beforeLoad context for navigation', async () => {
    const seen: Array<boolean> = []
    const loader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      preload: false,
      staleTime: Infinity,
      beforeLoad: ({ preload }) => {
        seen.push(preload)
      },
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/guarded' })

    expect(seen).toEqual([true])
    expect(loader).not.toHaveBeenCalled()

    await router.navigate({ to: '/guarded' })

    expect(seen).toEqual([true, false])
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
