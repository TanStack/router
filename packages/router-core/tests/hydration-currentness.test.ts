import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter, NavigateFn } from '../src'
import type { DehydratedRouter, TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

async function dehydrateToBootstrap(router: AnyRouter): Promise<TsrSsrGlobal> {
  attachRouterServerSsrUtils({ router, manifest: testManifest })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()

    const context: Record<string, any> = {
      document: { currentScript: { remove() {} } },
    }
    context.self = context
    runInNewContext(script!.children!, context)

    expect(context.$_TSR).toBeDefined()
    return context.$_TSR
  } finally {
    router.serverSsr?.cleanup()
  }
}

// These tests install the hydration protocol directly so client-only hooks can
// be paused at deterministic ownership boundaries.
function installHydrationPayload(
  mockWindow: { $_TSR?: TsrSsrGlobal },
  matches: DehydratedRouter['matches'],
) {
  mockWindow.$_TSR = {
    router: {
      manifest: testManifest,
      dehydratedData: {},
      matches,
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }
}

/**
 * Hydration asset work is another private lane generation. If a public
 * navigation commits while an old hydration head is pending, the hydration
 * continuation must not execute more old-lane hooks or mark its captured
 * location as resolved.
 */
describe('hydration asset currentness', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('does not resume an old hydration lane after a newer navigation commits', async () => {
    const oldHeadGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const oldHead = vi.fn(() => oldHeadGate)
    const oldScripts = vi.fn(() => [
      { children: 'window.oldHydrationLaneRan = true' },
    ])
    const newHead = vi.fn(() => ({
      meta: [{ title: 'New route' }],
    }))

    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      head: oldHead,
      scripts: oldScripts,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      head: newHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const oldMatches = router.matchRoutes(router.stores.location.get())

    installHydrationPayload(
      mockWindow,
      oldMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    const hydration = hydrate(router)
    try {
      await vi.waitFor(() => expect(oldHead).toHaveBeenCalledTimes(1))

      // No framework history subscriber exists during the initial hydration
      // handoff, so navigate() exercises its public direct router.load() path.
      await router.navigate({ to: '/new' })

      expect(router.state.location.pathname).toBe('/new')
      expect(router.state.resolvedLocation?.pathname).toBe('/new')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        newRoute.id,
      ])
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: newRoute.id,
        status: 'success',
        meta: [{ title: 'New route' }],
      })

      oldHeadGate.resolve({ meta: [{ title: 'Old route' }] })
      await hydration

      expect(oldScripts).not.toHaveBeenCalled()
      expect(newHead).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/new')
      expect(router.state.resolvedLocation?.pathname).toBe('/new')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        newRoute.id,
      ])
      expect(router.state.matches.at(-1)?.meta).toEqual([
        { title: 'New route' },
      ])
    } finally {
      if (oldHeadGate.status === 'pending') {
        oldHeadGate.resolve({ meta: [{ title: 'Old route' }] })
      }
      await hydration
    }
  })

  test('a synchronous context navigation prevents stale hydration assets from running', async () => {
    const oldHead = vi.fn(() => ({ meta: [{ title: 'Old route' }] }))
    const oldScripts = vi.fn(() => [
      { children: 'window.oldHydrationLaneRan = true' },
    ])
    const newHead = vi.fn(() => ({ meta: [{ title: 'New route' }] }))

    let navigation: Promise<void> | undefined
    let navigateDuringHydration = false
    const navigationStarted = vi.fn()
    const oldContext = vi.fn(({ navigate }: { navigate: NavigateFn }) => {
      if (navigateDuringHydration) {
        navigateDuringHydration = false
        navigationStarted()
        navigation = navigate({ to: '/new' })
      }
      return { source: 'old' }
    })
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      context: oldContext,
      head: oldHead,
      scripts: oldScripts,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      head: newHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const oldMatches = router.matchRoutes(router.stores.location.get())

    installHydrationPayload(
      mockWindow,
      oldMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    navigateDuringHydration = true
    await hydrate(router)
    expect(navigationStarted).toHaveBeenCalled()
    expect(navigation).toBeDefined()
    await navigation

    expect(router.state.location.pathname).toBe('/new')
    expect(router.state.resolvedLocation?.pathname).toBe('/new')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: newRoute.id,
      status: 'success',
      meta: [{ title: 'New route' }],
    })
    expect(oldContext).toHaveBeenCalled()
    expect(oldHead).not.toHaveBeenCalled()
    expect(oldScripts).not.toHaveBeenCalled()
    expect(newHead).toHaveBeenCalled()
  })

  test('client navigation after data-only hydration does not adopt a different route prefix', async () => {
    const serverOldBeforeLoad = vi.fn(() => ({ source: 'old-server' }))
    const serverOldLoader = vi.fn(() => 'old-server')
    const serverRootRoute = new BaseRootRoute({})
    const serverOldRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/old',
      ssr: 'data-only',
      beforeLoad: serverOldBeforeLoad,
      loader: serverOldLoader,
    })
    const serverNewRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/new',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverOldRoute, serverNewRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter)

    expect(serverOldBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverOldLoader).toHaveBeenCalledTimes(1)
    expect(serverRouter.state.matches.at(-1)).toMatchObject({
      routeId: serverOldRoute.id,
      status: 'success',
      ssr: 'data-only',
      context: { source: 'old-server' },
      loaderData: 'old-server',
    })
    const oldBeforeLoad = vi.fn(() => ({ source: 'old-client' }))
    const oldLoader = vi.fn(() => 'old-client')
    const newBeforeLoad = vi.fn(() => ({ source: 'new-client' }))
    const newLoader = vi.fn(() => 'new-client')
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      ssr: 'data-only',
      beforeLoad: oldBeforeLoad,
      loader: oldLoader,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      beforeLoad: newBeforeLoad,
      loader: newLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    expect(router.state.location.pathname).toBe('/old')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: oldRoute.id,
      status: 'pending',
      context: { source: 'old-server' },
      loaderData: 'old-server',
    })
    expect(oldBeforeLoad).not.toHaveBeenCalled()
    expect(oldLoader).not.toHaveBeenCalled()

    await router.navigate({ to: '/new' })

    expect(router.state.location.pathname).toBe('/new')
    expect(router.state.resolvedLocation?.pathname).toBe('/new')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      newRoute.id,
    ])
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: newRoute.id,
      status: 'success',
      context: { source: 'new-client' },
      loaderData: 'new-client',
    })
    expect(newBeforeLoad).toHaveBeenCalledTimes(1)
    expect(newLoader).toHaveBeenCalledTimes(1)
    expect(oldBeforeLoad).not.toHaveBeenCalled()
    expect(oldLoader).not.toHaveBeenCalled()
  })

  test('same-location hydration only adopts the matching server match identities', async () => {
    let version = 1
    const serverBeforeLoad = vi.fn(() => ({ source: 'server' }))
    const serverLoader = vi.fn(() => 'server')
    const serverRootRoute = new BaseRootRoute({})
    const serverPageRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/page',
      ssr: 'data-only',
      loaderDeps: () => ({ version }),
      beforeLoad: serverBeforeLoad,
      loader: serverLoader,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverPageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter)

    expect(serverBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverLoader).toHaveBeenCalledTimes(1)
    expect(serverRouter.state.matches.at(-1)).toMatchObject({
      routeId: serverPageRoute.id,
      status: 'success',
      ssr: 'data-only',
      context: { source: 'server' },
      loaderData: 'server',
    })
    const beforeLoad = vi.fn(() => ({ source: 'client' }))
    const loader = vi.fn(() => 'client')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: 'data-only',
      loaderDeps: () => ({ version }),
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'pending',
      context: { source: 'server' },
      loaderData: 'server',
    })
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()

    version = 2
    await router.load()

    expect(router.state.location.pathname).toBe('/page')
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      context: { source: 'client' },
      loaderData: 'client',
    })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('invalidation during hydration handoff reloads the server prefix', async () => {
    const serverRootLoader = vi.fn(() => 'server')
    const serverRootRoute = new BaseRootRoute({ loader: serverRootLoader })
    const serverPageRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/page',
      ssr: 'data-only',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverPageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter)

    expect(serverRootLoader).toHaveBeenCalledTimes(1)
    expect(serverRouter.state.matches[0]).toMatchObject({
      routeId: serverRootRoute.id,
      status: 'success',
      loaderData: 'server',
    })
    expect(serverRouter.state.matches.at(-1)).toMatchObject({
      routeId: serverPageRoute.id,
      status: 'success',
      ssr: 'data-only',
    })
    const rootLoader = vi.fn(() => 'client')
    const rootRoute = new BaseRootRoute({ loader: rootLoader })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: 'data-only',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    expect(rootLoader).not.toHaveBeenCalled()
    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      status: 'success',
      loaderData: 'server',
    })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'pending',
      ssr: 'data-only',
    })

    await router.invalidate({
      filter: (match) => match.routeId === rootRoute.id,
    })

    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      status: 'success',
      loaderData: 'client',
    })
    expect(router.state.location.pathname).toBe('/page')
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
  })

  test('an adopted data-only error does not run its server-omitted descendants', async () => {
    const serverError = new Error('server failed')
    const serverBeforeLoad = vi.fn(() => {
      throw serverError
    })
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      ssr: 'data-only',
      beforeLoad: serverBeforeLoad,
    })
    const serverChildLoader = vi.fn()
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      loader: serverChildLoader,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter)

    expect(serverBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverChildLoader).not.toHaveBeenCalled()
    expect(serverRouter.state.matches.map((match) => match.routeId)).toEqual([
      serverRootRoute.id,
      serverParentRoute.id,
    ])
    expect(serverRouter.state.matches.at(-1)).toMatchObject({
      routeId: serverParentRoute.id,
      status: 'error',
      ssr: 'data-only',
      error: serverError,
    })
    const transportedError = bootstrap.router?.matches.at(-1)?.e
    expect(transportedError).not.toBe(serverError)
    expect(transportedError).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })

    const parentBeforeLoad = vi.fn()
    const childBeforeLoad = vi.fn()
    const childLoader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      ssr: 'data-only',
      beforeLoad: parentBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'pending',
      error: transportedError,
    })
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()

    await router.load()

    expect(router.state.location.pathname).toBe('/parent/child')
    expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'error',
      error: transportedError,
    })
    expect(router.state.matches.at(-1)?.error).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })

  test('a same-href load owns route hooks when an older hydration chunk settles later', async () => {
    const routeChunkGate = createControlledPromise<void>()
    let pagePreloadCalls = 0
    const pagePreload = vi.fn(() => {
      pagePreloadCalls++
      return pagePreloadCalls === 1 ? routeChunkGate : Promise.resolve()
    })
    const Page = Object.assign(() => null, {
      preload: pagePreload,
    })
    const routeContext = vi.fn(() => ({ source: 'same-href' }))
    const head = vi.fn(() => ({ meta: [{ title: 'Same href' }] }))
    const scripts = vi.fn(() => [
      { children: 'window.sameHrefHydrationRan = true' },
    ])

    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      component: Page,
      context: routeContext,
      head,
      scripts,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    const dehydratedMatches = router.matchRoutes(router.stores.location.get())

    installHydrationPayload(
      mockWindow,
      dehydratedMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    const hydration = hydrate(router)
    try {
      await vi.waitFor(() => expect(pagePreload).toHaveBeenCalledTimes(1))

      routeContext.mockClear()
      head.mockClear()
      scripts.mockClear()
      const replacement = router.load()

      // The replacement's second chunk request resolves independently, so it
      // must commit before the stale hydration request is allowed to settle.
      await replacement

      expect(routeChunkGate.status).toBe('pending')
      expect(pagePreload).toHaveBeenCalledTimes(2)
      expect(router.state.location.pathname).toBe('/page')
      expect(router.state.resolvedLocation?.pathname).toBe('/page')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: pageRoute.id,
        status: 'success',
        meta: [{ title: 'Same href' }],
        scripts: [{ children: 'window.sameHrefHydrationRan = true' }],
      })
      expect(routeContext).toHaveBeenCalledTimes(1)
      expect(head).toHaveBeenCalledTimes(1)
      expect(scripts).toHaveBeenCalledTimes(1)

      routeChunkGate.resolve()
      await hydration

      expect(router.state.resolvedLocation?.pathname).toBe('/page')
      expect(router.state.matches.at(-1)?.meta).toEqual([
        { title: 'Same href' },
      ])
      expect(routeContext).toHaveBeenCalledTimes(1)
      expect(head).toHaveBeenCalledTimes(1)
      expect(scripts).toHaveBeenCalledTimes(1)
    } finally {
      if (routeChunkGate.status === 'pending') {
        routeChunkGate.resolve()
      }
      await hydration
    }
  })
})
