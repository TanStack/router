import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch, AnyRouter } from '../src'
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

    return context.$_TSR
  } finally {
    router.serverSsr?.cleanup()
  }
}

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
    h() {},
    e() {},
    c() {},
    p() {},
    buffer: [],
  }
}

describe('public hydration contracts', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('starts head and scripts together and swallows a head failure', async () => {
    const error = new Error('head failed')
    const headGate = createControlledPromise<void>()
    const head = vi.fn(async () => {
      await headGate
      throw error
    })
    const scripts = vi.fn(() => [
      { children: 'window.hydrationScriptRan = true' },
    ])
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      head,
      scripts,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      matches.map((match) => ({
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    const hydration = hydrate(router)
    await vi.waitFor(() => {
      expect(head).toHaveBeenCalledTimes(1)
      expect(scripts).toHaveBeenCalledTimes(1)
    })

    headGate.resolve()
    await expect(hydration).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(error)
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
    })
  })

  test('adopts a shorter selective-SSR prefix ending at a pending client-only match', async () => {
    const serverLoader = vi.fn(() => 'server data')
    const serverRootRoute = new BaseRootRoute({})
    const serverClientOnlyRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/client-only',
      ssr: false,
      loader: serverLoader,
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverClientOnlyRoute,
      path: '/child',
      ssr: true,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverClientOnlyRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/client-only/child'],
      }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter)
    expect(bootstrap.router?.matches).toHaveLength(2)
    expect(bootstrap.router?.matches.at(-1)).toMatchObject({
      s: 'pending',
      ssr: false,
    })
    expect(serverLoader).not.toHaveBeenCalled()

    const beforeLoad = vi.fn(() => ({ clientContext: true }))
    const loader = vi.fn(({ context }) => context.clientContext)
    const rootRoute = new BaseRootRoute({})
    const clientOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      beforeLoad,
      loader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => clientOnlyRoute,
      path: '/child',
      ssr: true,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        clientOnlyRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/client-only/child'],
      }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      clientOnlyRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches.slice(1)).toMatchObject([
      { routeId: clientOnlyRoute.id, status: 'pending', ssr: false },
      { routeId: childRoute.id, ssr: true },
    ])
    expect(router.state.resolvedLocation).toBeUndefined()
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()

    await router.load()

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches[1]).toMatchObject({
      routeId: clientOnlyRoute.id,
      status: 'success',
      loaderData: true,
    })
    expect(router.state.resolvedLocation?.href).toBe('/client-only/child')
  })

  test('selective SSR exposes the complete accepted lane to route context and head hooks', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverClientOnlyRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/client-only',
      ssr: false,
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverClientOnlyRoute,
      path: '/child',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverClientOnlyRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/client-only/child'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter)

    const contextLanes: Array<Array<string>> = []
    const headLanes: Array<Array<string>> = []
    const rootRoute = new BaseRootRoute({
      context: ({ matches }) => {
        contextLanes.push(matches.map((match) => match.routeId))
        return { hydrated: true }
      },
      head: ({ matches }) => {
        headLanes.push(matches.map((match) => match.routeId))
        return {
          meta: [
            {
              title: String(matches[1]?.loaderData),
            },
          ],
        }
      },
    })
    const clientOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      loader: () => 'client data',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => clientOnlyRoute,
      path: '/child',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        clientOnlyRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/client-only/child'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    const fullLane = [rootRoute.id, clientOnlyRoute.id, childRoute.id]
    expect(contextLanes).toEqual([fullLane])
    expect(headLanes).toEqual([fullLane])
    expect(router.state.matches.map((match) => match.routeId)).toEqual(fullLane)
    expect(router.state.matches[0]?.context).toMatchObject({ hydrated: true })
    expect(router.state.matches[0]?.meta).toEqual([{ title: 'undefined' }])

    await router.load()

    expect(router.state.matches[0]?.meta).toEqual([{ title: 'client data' }])
  })

  test('shell hydration exposes the complete accepted lane to route context and head hooks', async () => {
    const contextLanes: Array<Array<string>> = []
    const headLanes: Array<Array<string>> = []
    const rootRoute = new BaseRootRoute({
      context: ({ matches }) => {
        contextLanes.push(matches.map((match) => match.routeId))
        return { hydrated: true }
      },
      head: ({ matches }) => {
        headLanes.push(matches.map((match) => match.routeId))
        return { meta: [{ title: 'Shell hydration' }] }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      ssr: false,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
    ])

    await hydrate(router)

    const fullLane = [rootRoute.id, childRoute.id]
    expect(contextLanes).toEqual([fullLane])
    expect(headLanes).toEqual([fullLane])
    expect(router.state.matches.map((match) => match.routeId)).toEqual(fullLane)
    expect(router.state.matches[0]?.context).toMatchObject({ hydrated: true })
    expect(router.state.matches[0]?.meta).toEqual([
      { title: 'Shell hydration' },
    ])
  })

  test('terminal hydration exposes the full structural lane to route context and head hooks', async () => {
    const contextLanes: Array<Array<string>> = []
    const headLanes: Array<Array<string>> = []
    const observeContext = ({ matches }: { matches: Array<AnyRouteMatch> }) => {
      contextLanes.push(matches.map((match) => match.routeId))
      return {}
    }
    const observeHead = ({ matches }: { matches: Array<AnyRouteMatch> }) => {
      headLanes.push(matches.map((match) => match.routeId))
      return { meta: [{ title: 'Terminal hydration' }] }
    }
    const rootRoute = new BaseRootRoute({
      context: observeContext,
      head: observeHead,
    })
    const boundaryRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      context: observeContext,
      head: observeHead,
      errorComponent: () => 'App error',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => boundaryRoute,
      path: '/child',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        boundaryRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/app/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
      {
        s: 'error',
        e: new Error('App failed on the server'),
        ssr: true,
        u: Date.now(),
      },
    ])

    await hydrate(router)

    const fullLane = [rootRoute.id, boundaryRoute.id, childRoute.id]
    expect(contextLanes).toEqual([fullLane, fullLane])
    expect(headLanes).toEqual([fullLane, fullLane])
    expect(router.state.matches.map((match) => match.routeId)).toEqual(fullLane)
    expect(router.state.matches[1]).toMatchObject({
      routeId: boundaryRoute.id,
      status: 'error',
    })
    expect(router.state.matches[2]?.status).toBe('success')
  })

  test('does not cache missing loader data when retrying a hydrated terminal boundary', async () => {
    const serverError = new Error('Server boundary failed')
    const chunkError = new Error('Boundary chunk failed during hydration')
    const errorComponentPreload = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(chunkError)
      .mockResolvedValue(undefined)
    const ErrorComponent = Object.assign(() => 'App error', {
      preload: errorComponentPreload,
    })
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => 'client data')
    const rootRoute = new BaseRootRoute({})
    const boundaryRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      beforeLoad,
      loader,
      errorComponent: ErrorComponent,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => boundaryRoute,
      path: '/child',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        boundaryRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/app/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
      {
        s: 'error',
        e: serverError,
        ssr: true,
        u: Date.now(),
      },
    ])

    await hydrate(router)

    expect(errorComponentPreload).toHaveBeenCalledTimes(1)
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(router.state.resolvedLocation).toBeUndefined()
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      boundaryRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]).toMatchObject({
      status: 'error',
      error: serverError,
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.resolvedLocation?.href).toBe('/app/child')
    expect(router.state.matches[1]).toMatchObject({
      status: 'success',
      error: undefined,
      loaderData: 'client data',
    })
  })

  test('retries a terminal lane after ancestor context reconstruction fails', async () => {
    const serverError = new Error('Server boundary failed')
    const clientError = new Error('Client boundary failed')
    const contextError = new Error('Root context failed during hydration')
    const context = vi
      .fn<() => { clientContext: true }>()
      .mockImplementationOnce(() => {
        throw contextError
      })
      .mockReturnValue({ clientContext: true })
    const beforeLoad = vi.fn(() => {
      throw clientError
    })
    const rootRoute = new BaseRootRoute({ context })
    const boundaryRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      beforeLoad,
      errorComponent: () => 'App error',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => boundaryRoute,
      path: '/child',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        boundaryRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/app/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
      {
        s: 'error',
        e: serverError,
        ssr: true,
        u: Date.now(),
      },
    ])

    await hydrate(router)

    expect(context).toHaveBeenCalledTimes(1)
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(router.state.resolvedLocation).toBeUndefined()
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      boundaryRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]).toMatchObject({
      status: 'error',
      error: serverError,
    })

    await router.load()

    expect(context).toHaveBeenCalledTimes(2)
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(router.state.resolvedLocation?.href).toBe('/app/child')
    expect(router.state.matches[0]?.context).toMatchObject({
      clientContext: true,
    })
    expect(router.state.matches[1]).toMatchObject({
      status: 'error',
      error: clientError,
    })
  })

  test('does not repeat data-only assets during client continuation', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverPageRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/page',
      ssr: 'data-only',
      loader: () => 'server data',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverPageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter)

    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: String(loaderData) }],
    }))
    const scripts = vi.fn(({ loaderData }) => [
      { children: `window.pageData = ${JSON.stringify(loaderData)}` },
    ])
    const loader = vi.fn(() => 'client data')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: 'data-only',
      loader,
      head,
      scripts,
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
      loaderData: 'server data',
      meta: [{ title: 'server data' }],
      scripts: [{ children: 'window.pageData = "server data"' }],
    })
    expect(head).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(loader).not.toHaveBeenCalled()

    await router.load()

    expect(router.state.resolvedLocation?.pathname).toBe('/page')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'server data',
      meta: [{ title: 'server data' }],
      scripts: [{ children: 'window.pageData = "server data"' }],
    })
    expect(head).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(loader).not.toHaveBeenCalled()
  })

  test('adopts the complete nested data-only server prefix', async () => {
    const serverParentBeforeLoad = vi.fn(() => ({ source: 'server' }))
    const serverParentLoader = vi.fn(() => 'server parent')
    const serverChildBeforeLoad = vi.fn()
    const serverChildLoader = vi.fn(() => 'server child')
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      ssr: 'data-only',
      beforeLoad: serverParentBeforeLoad,
      loader: serverParentLoader,
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      beforeLoad: serverChildBeforeLoad,
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

    expect(serverParentBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverChildBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverParentLoader).toHaveBeenCalledTimes(1)
    expect(serverChildLoader).toHaveBeenCalledTimes(1)

    const parentBeforeLoad = vi.fn(() => ({ source: 'client' }))
    const parentLoader = vi.fn(() => 'client parent')
    const childBeforeLoad = vi.fn()
    const childLoader = vi.fn(() => 'client child')
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      ssr: 'data-only',
      beforeLoad: parentBeforeLoad,
      loader: parentLoader,
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

    expect(router.state.matches[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'pending',
      loaderData: 'server parent',
    })
    expect(router.state.matches[2]).toMatchObject({
      routeId: childRoute.id,
      status: 'success',
      loaderData: 'server child',
    })
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(parentLoader).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()

    await router.load()

    expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    expect(router.state.matches[1]).toMatchObject({
      status: 'success',
      context: { source: 'server' },
      loaderData: 'server parent',
    })
    expect(router.state.matches[2]).toMatchObject({
      status: 'success',
      loaderData: 'server child',
    })
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(parentLoader).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })

  test('keeps an ssr-false route-context error authoritative', async () => {
    const serverError = new Error('server route context failed')
    const serverRootRoute = new BaseRootRoute({})
    const serverPageRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/page',
      ssr: false,
      context: () => {
        throw serverError
      },
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverPageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter)
    const transportedError = bootstrap.router?.matches.at(-1)?.e

    expect(transportedError).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })

    const context = vi.fn(() => ({ source: 'client' }))
    const beforeLoad = vi.fn()
    const loader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: false,
      context,
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
      error: transportedError,
    })
    expect(context).toHaveBeenCalledTimes(1)
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()

    await router.load()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'error',
      error: transportedError,
    })
    expect(context).toHaveBeenCalledTimes(1)
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
  })

  test('aborts the hydrated route context generation when the route is later left', async () => {
    const capturedSignals: Array<AbortSignal> = []
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      context: ({ abortController }) => {
        capturedSignals.push(abortController.signal)
        return { hydrated: true }
      },
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      matches.map((match) => ({
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    await hydrate(router)
    const hydratedSignal = capturedSignals.at(-1)!
    await router.load()
    const reloadedSignal = router.state.matches.find(
      (match) => match.routeId === oldRoute.id,
    )!.abortController.signal
    expect(hydratedSignal.aborted).toBe(true)
    expect(reloadedSignal).not.toBe(hydratedSignal)
    expect(reloadedSignal.aborted).toBe(false)

    await router.navigate({ to: '/new' })

    expect(reloadedSignal.aborted).toBe(true)
    expect(router.state.resolvedLocation?.pathname).toBe('/new')
  })

  test('keeps hydrated route context alive when the initial load is synchronously superseded', async () => {
    let capturedSignal: AbortSignal | undefined
    const beforeLoadGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({
      context: ({ abortController }) => {
        capturedSignal = abortController.signal
        return { hydrated: true }
      },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: false,
      beforeLoad: async () => {
        await beforeLoadGate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      matches.map((match, index) => ({
        s: index ? ('pending' as const) : ('success' as const),
        ssr: index ? false : true,
        u: Date.now(),
      })),
    )

    await hydrate(router)
    expect(router.state.resolvedLocation).toBeUndefined()
    let winningLoad: Promise<void> | undefined
    const unsubscribe = router.subscribe('onBeforeNavigate', () => {
      unsubscribe()
      winningLoad = router.load()
    })

    const supersededLoad = router.load()
    await vi.waitFor(() => {
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: pageRoute.id,
        status: 'pending',
      })
    })
    expect(router.state.matches.at(-1)!.abortController.signal.aborted).toBe(
      false,
    )

    beforeLoadGate.resolve()
    await supersededLoad
    await winningLoad

    expect(capturedSignal?.aborted).toBe(false)
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
  })

  test('turns a client route-context reconstruction failure into a route error', async () => {
    const contextError = new Error('client context failed')
    const onError = vi.fn()
    const loader = vi.fn(() => 'client data')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: () => {
        throw contextError
      },
      loader,
      onError,
      errorComponent: () => 'Page error',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      matches.map((match) => ({
        s: 'success' as const,
        l: match.routeId === pageRoute.id ? 'server data' : undefined,
        ssr: true,
        u: Date.now(),
      })),
    )

    await expect(hydrate(router)).resolves.toBeUndefined()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      error: undefined,
      loaderData: 'server data',
    })
    expect(router.state.resolvedLocation).toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()

    await router.load()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'error',
      error: contextError,
      loaderData: 'server data',
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(contextError)
    expect(loader).not.toHaveBeenCalled()
  })

  test('preserves route-context redirect control during hydration reconstruction', async () => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      context: () => {
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      matches.map((match) => ({
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    await expect(hydrate(router)).resolves.toBeUndefined()

    expect(router.state.location.pathname).toBe('/source')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: sourceRoute.id,
      status: 'success',
    })
    expect(router.state.resolvedLocation).toBeUndefined()

    await router.load()

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.resolvedLocation?.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  })

  test('keeps a transported terminal route-context error authoritative', async () => {
    const serverError = new Error('server context failed')
    const serverRootRoute = new BaseRootRoute({})
    const serverPageRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/page',
      context: () => {
        throw serverError
      },
      errorComponent: () => 'Page error',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverPageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter)
    const transportedError = bootstrap.router?.matches.at(-1)?.e

    const clientContextError = new Error('client context failed')
    const beforeLoad = vi.fn()
    const loader = vi.fn(
      ({ context }: { context: { recovered?: boolean } }) => context.recovered,
    )
    const onError = vi.fn()
    const clientContext = vi.fn((): { recovered: boolean } => {
      throw clientContextError
    })
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: clientContext,
      beforeLoad,
      loader,
      onError,
      errorComponent: () => 'Page error',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await expect(hydrate(router)).resolves.toBeUndefined()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'error',
      error: transportedError,
    })
    expect(router.state.matches.at(-1)?.error).not.toBe(clientContextError)
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
    expect(onError).not.toHaveBeenCalled()
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()

    clientContext.mockImplementation(() => ({ recovered: true }))
    await router.invalidate()

    expect(clientContext).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      context: { recovered: true },
      loaderData: true,
    })
  })

  test('turns a hydrated normal-component chunk failure into a route error without rerunning loader data', async () => {
    const chunkError = new Error('page component failed to load')
    const componentPreload = vi.fn(() => Promise.reject(chunkError))
    const Page = Object.assign(() => 'Page', { preload: componentPreload })
    const loader = vi.fn(() => 'client data')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      component: Page,
      errorComponent: () => 'Page error',
      loader,
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      matches.map((match) => ({
        s: 'success' as const,
        l: match.routeId === pageRoute.id ? 'server data' : undefined,
        ssr: true,
        u: Date.now(),
      })),
    )

    await expect(hydrate(router)).resolves.toBeUndefined()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      error: undefined,
      loaderData: 'server data',
    })
    expect(router.state.resolvedLocation).toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()

    await router.load()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'error',
      error: chunkError,
      loaderData: 'server data',
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(chunkError)
    expect(loader).not.toHaveBeenCalled()
  })
})
