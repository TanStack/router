import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

describe('preloaded beforeLoad context reuse', () => {
  test('reuses fresh nested context for navigation and child loaders', async () => {
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

    expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
    expect(parentBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({ preload: true }),
    )
    expect(childBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ parent: 'preloaded parent' }),
        preload: true,
      }),
    )
    expect(childLoader).toHaveBeenCalledTimes(1)
    const match = router.state.matches.find(
      (candidate) => candidate.routeId === childRoute.id,
    )
    expect(match?.context).toEqual({
      parent: 'preloaded parent',
      child: 'preloaded parent:true',
    })
    expect(match?.loaderData).toEqual({
      context: {
        parent: 'preloaded parent',
        child: 'preloaded parent:true',
      },
      preload: true,
    })
  })

  test('keeps beforeLoad independent while joining a pending preload loader', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      guard: preload ? 'preloaded' : 'loaded',
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
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('shared loader data')
    await Promise.all([preload, navigation])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.context).toEqual({ guard: 'loaded' })
    expect(router.state.matches.at(-1)?.loaderData).toBe('shared loader data')
  })

  test.each([
    { age: 50, expected: [false, true], guard: 'preloaded' },
    { age: 100, expected: [false, true, false], guard: 'loaded' },
  ])(
    'uses the beforeLoad completion time when loader data remains navigation-owned at age $age',
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

  test('keeps a fresh beforeLoad-only preload across an unrelated navigation', async () => {
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
    ])
    expect(router.state.matches.at(-1)?.context).toEqual({
      guard: 'preloaded',
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

  test('does not publish context from a beforeLoad replaced during preload', async () => {
    const oldBeforeLoadGate = createControlledPromise<void>()
    const oldBeforeLoad = vi.fn(async () => {
      await oldBeforeLoadGate
      return { version: 'old' }
    })
    const newBeforeLoad = vi.fn(() => ({ version: 'new' }))
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      preloadStaleTime: Infinity,
      beforeLoad: oldBeforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/guarded' })
    await vi.waitFor(() => expect(oldBeforeLoad).toHaveBeenCalledTimes(1))

    guardedRoute.options.beforeLoad = newBeforeLoad as any
    expect(router._refreshRoute).toBeDefined()
    await router._refreshRoute!(guardedRoute.id)
    oldBeforeLoadGate.resolve()
    await preload
    await router.navigate({ to: '/guarded' })

    expect(oldBeforeLoad).toHaveBeenCalledTimes(1)
    expect(newBeforeLoad).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.context).toEqual({ version: 'new' })
  })

  test('does not publish descendants of a beforeLoad replaced during preload', async () => {
    const oldBeforeLoadGate = createControlledPromise<void>()
    const oldBeforeLoad = vi.fn(async () => {
      await oldBeforeLoadGate
      return { version: 'old' }
    })
    const newBeforeLoad = vi.fn(() => ({ version: 'new' }))
    const childLoader = vi.fn(
      ({ context }: { context: { version: string } }) => context.version,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      preloadStaleTime: Infinity,
      beforeLoad: oldBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
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
    const preload = router.preloadRoute({ to: '/parent/child' })
    await vi.waitFor(() => expect(oldBeforeLoad).toHaveBeenCalledTimes(1))

    parentRoute.options.beforeLoad = newBeforeLoad as any
    expect(router._refreshRoute).toBeDefined()
    await router._refreshRoute!(parentRoute.id)
    oldBeforeLoadGate.resolve()
    await preload
    await router.navigate({ to: '/parent/child' })

    expect(oldBeforeLoad).toHaveBeenCalledTimes(1)
    expect(newBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('new')
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

  test('shouldReload remains scoped to loader data', async () => {
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      guard: preload ? 'preloaded' : 'loaded',
    }))
    const loader = vi.fn(({ preload }: { preload: boolean }) => preload)
    const shouldReload = vi.fn(() => true)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      staleTime: Infinity,
      beforeLoad,
      shouldReload,
      loader: {
        staleReloadMode: 'blocking',
        handler: loader,
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/guarded' })
    await router.navigate({ to: '/guarded' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(loader.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(shouldReload).toHaveBeenCalledTimes(1)
    expect(shouldReload).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ guard: 'preloaded' }),
        preload: false,
      }),
    )
  })

  test('shouldReload false does not keep stale beforeLoad context', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      guard: preload ? 'preloaded' : 'loaded',
    }))
    const loader = vi.fn(({ preload }: { preload: boolean }) => preload)
    const shouldReload = vi.fn(() => false)
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
      shouldReload,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/guarded' })
    vi.setSystemTime(1_100)
    await router.navigate({ to: '/guarded' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
    ])
    expect(shouldReload).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.context).toEqual({ guard: 'loaded' })
  })

  test('a beforeLoad failure clears context from the previous generation', async () => {
    const failure = new Error('guard failed')
    let fail = false
    const rootRoute = new BaseRootRoute({})
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      context: () => ({ routeContext: true }),
      beforeLoad: () => {
        if (fail) {
          throw failure
        }
        return { guard: 'accepted' }
      },
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/guarded'] }),
    })

    await router.load()
    expect(router.state.matches.at(-1)?.context).toEqual({
      routeContext: true,
      guard: 'accepted',
    })

    fail = true
    await router.load()

    const failedMatch = router.state.matches.at(-1)
    expect(failedMatch).toMatchObject({
      status: 'error',
      error: failure,
    })
    expect(failedMatch?.context).toEqual({ routeContext: true })
  })

  test('a validation failure clears context from the previous generation', async () => {
    let fail = false
    const rootRoute = new BaseRootRoute({})
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      validateSearch: () => {
        if (fail) {
          throw new Error('invalid search')
        }
        return {}
      },
      context: () => ({ routeContext: true }),
      beforeLoad: () => ({ guard: 'accepted' }),
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/guarded'] }),
    })

    await router.load()
    expect(router.state.matches.at(-1)?.context).toEqual({
      routeContext: true,
      guard: 'accepted',
    })
    fail = true
    await router.load()

    const failedMatch = router.state.matches.at(-1)
    expect(failedMatch).toMatchObject({
      status: 'error',
    })
    expect(failedMatch?.context).toEqual({ routeContext: true })
  })
})
