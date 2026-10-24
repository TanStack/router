import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

afterEach(() => vi.restoreAllMocks())

test('a completed async context-only preload leaves an idle cached match', async () => {
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const page = new BaseRoute({
    getParentRoute: () => root,
    path: '/page',
    context: async () => ({ ready: true }),
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  try {
    await router.load()
    await router.preloadRoute({ to: '/page' })

    const cachedFetching: Array<unknown> = []
    router.clearCache({
      filter: (match) => {
        if (match.routeId === page.id) {
          cachedFetching.push(match.isFetching)
        }
        return false
      },
    })

    expect(cachedFetching).toEqual([false])
    expect(
      router
        .matchRoutes(router.buildLocation({ to: '/page' }))
        .find((match) => match.routeId === page.id),
    ).toMatchObject({ status: 'success', isFetching: false })
  } finally {
    router.clearCache()
    router.history.destroy()
  }
})

test('preserves current context when an older preload finishes after the route changes depth', async () => {
  const entered = createControlledPromise<void>()
  const release = createControlledPromise<void>()
  const oldRoot = new BaseRootRoute({})
  const oldHome = new BaseRoute({
    getParentRoute: () => oldRoot,
    path: '/',
  })
  const oldPage = new BaseRoute({
    getParentRoute: () => oldRoot,
    path: '/a/b',
    context: async () => {
      entered.resolve()
      await release
      return { generation: 'obsolete' }
    },
  })
  const router = createTestRouter<AnyRoute>({
    routeTree: oldRoot.addChildren([oldHome, oldPage]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  let preload: ReturnType<typeof router.preloadRoute> | undefined
  try {
    await router.load()
    preload = router.preloadRoute({ to: '/a/b' })
    await entered

    const root = new BaseRootRoute({})
    const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const layout = new BaseRoute({ getParentRoute: () => root, path: '/a' })
    const currentContext = vi.fn(() => ({ generation: 'current' }))
    const page = new BaseRoute({
      getParentRoute: () => layout,
      path: '/b',
      context: currentContext,
    })
    router.update({
      routeTree: root.addChildren([home, layout.addChildren([page])]),
    })
    expect(page.id).toBe(oldPage.id)
    await router.navigate({ to: '/a/b' })
    expect(router.state.matches.at(-1)?.context).toEqual({
      generation: 'current',
    })

    release.resolve()
    await preload
    await router.load()

    expect(router.state.matches.at(-1)?.context).toEqual({
      generation: 'current',
    })
    expect(currentContext).toHaveBeenCalledTimes(1)
  } finally {
    release.resolve()
    await preload
    router.clearCache()
    router.history.destroy()
  }
})

test('preserves current legacy fallback context when its match moves deeper', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const entered = createControlledPromise<void>()
  const release = createControlledPromise<void>()
  let contextCalls = 0
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const layout = new BaseRoute({ getParentRoute: () => root, path: '/layout' })
  const legacy = new BaseRoute({
    getParentRoute: () => root,
    path: '/404',
    context: async () => {
      contextCalls++
      if (contextCalls === 1) {
        entered.resolve()
        await release
        return { generation: 'obsolete' }
      }
      return { generation: 'current' }
    },
  })
  const router = createTestRouter<AnyRoute>({
    routeTree: root.addChildren([home, layout]),
    notFoundRoute: legacy,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  let preload: ReturnType<typeof router.preloadRoute> | undefined
  try {
    await router.load()
    preload = router.preloadRoute({ to: '/missing' })
    await entered
    await router.navigate({ to: '/layout/missing' })
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      root.id,
      layout.id,
      legacy.id,
    ])
    expect(router.state.matches.at(-1)?.context).toEqual({
      generation: 'current',
    })

    release.resolve()
    await preload
    await router.load()

    expect(router.state.matches.at(-1)?.context).toEqual({
      generation: 'current',
    })
    expect(contextCalls).toBe(2)
  } finally {
    release.resolve()
    await preload
    router.clearCache()
    router.history.destroy()
  }
})

test('a valid duplicate legacy fallback context protects against an older preload', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const entered = createControlledPromise<void>()
  const release = createControlledPromise<void>()
  let navigationContexts = 0
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const legacy = new BaseRoute({
    getParentRoute: () => root,
    path: '/legacy',
    context: async ({ preload }) => {
      if (preload) {
        entered.resolve()
        await release
        return { generation: 'obsolete' }
      }
      if (++navigationContexts === 2) {
        throw new Error('the appended fallback context failed')
      }
      return { generation: 'current' }
    },
    errorComponent: () => null,
  })
  const router = createTestRouter<AnyRoute>({
    routeTree: root.addChildren([home, legacy]),
    notFoundRoute: legacy,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  let preload: ReturnType<typeof router.preloadRoute> | undefined
  try {
    await router.load()
    preload = router.preloadRoute({ to: '/legacy/extra' })
    await entered

    await router.navigate({ to: '/legacy/extra' })

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      root.id,
      legacy.id,
      legacy.id,
    ])
    expect(navigationContexts).toBe(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'error',
      context: { generation: 'current' },
    })

    release.resolve()
    await preload
    await router.navigate({ to: '/legacy' })

    expect(router.state.location.pathname).toBe('/legacy')
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      context: { generation: 'current' },
    })
    expect(navigationContexts).toBe(2)
  } finally {
    release.resolve()
    await preload
    router.clearCache()
    router.history.destroy()
  }
})
