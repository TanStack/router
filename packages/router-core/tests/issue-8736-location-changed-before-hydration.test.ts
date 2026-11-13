import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

function createRouteTree(loaders: { a: () => string; b: () => string }) {
  const rootRoute = new BaseRootRoute({})
  const aRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/a',
    loader: loaders.a,
  })
  const bRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
    loader: loaders.b,
  })
  return { routeTree: rootRoute.addChildren([aRoute, bRoute]), aRoute, bRoute }
}

// https://github.com/TanStack/router/issues/8736
describe('location changed before hydration', () => {
  let mockWindow: {
    $_TSR?: TsrSsrGlobal
    location?: Pick<Location, 'pathname' | 'search' | 'hash'>
  }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  // The document was loaded from `documentHref`; the window is now at `currentHref`.
  function setBrowserLocation(documentHref: string, currentHref: string) {
    const url = new URL(currentHref, 'http://localhost')
    mockWindow.location = {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    }
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) =>
      type === 'navigation'
        ? ([
            { name: new URL(documentHref, 'http://localhost').href },
          ] as Array<PerformanceEntry>)
        : [],
    )
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderOnServer(href: string) {
    const server = createRouteTree({ a: () => 'a server', b: () => 'b server' })
    const serverRouter = createTestRouter({
      routeTree: server.routeTree,
      history: createMemoryHistory({ initialEntries: [href] }),
      isServer: true,
    })
    return dehydrateToBootstrap(serverRouter, testManifest)
  }

  test('hydrates the location the server rendered, then loads the current one', async () => {
    // The server rendered /b. Before the client hydrates, Back moves the
    // history to /a, an entry that shares the reloaded document.
    mockWindow.$_TSR = await renderOnServer('/b')
    setBrowserLocation('/b', '/a')

    const aLoader = vi.fn(() => 'a client')
    const bLoader = vi.fn(() => 'b client')
    const { routeTree, aRoute, bRoute } = createRouteTree({
      a: aLoader,
      b: bLoader,
    })
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/b', '/a'],
        initialIndex: 1,
      }),
      isServer: false,
    })

    await hydrate(router)

    // The server markup is /b's, so hydration presents /b with its server data.
    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.resolvedLocation?.pathname).toBe('/b')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: bRoute.id,
      status: 'success',
      loaderData: 'b server',
    })
    expect(aLoader).not.toHaveBeenCalled()
    expect(bLoader).not.toHaveBeenCalled()

    // The load after hydration (Transitioner's mount) moves to the current entry.
    await router.load()

    expect(router.state.location.pathname).toBe('/a')
    expect(router.state.resolvedLocation?.pathname).toBe('/a')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: aRoute.id,
      status: 'success',
      loaderData: 'a client',
    })
    expect(aLoader).toHaveBeenCalledTimes(1)
  })

  test('hydrates the current location when it is the one the server rendered', async () => {
    mockWindow.$_TSR = await renderOnServer('/b')
    setBrowserLocation('/b', '/b#section')

    const bLoader = vi.fn(() => 'b client')
    const { routeTree, bRoute } = createRouteTree({
      a: () => 'a client',
      b: bLoader,
    })
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/b'] }),
      isServer: false,
    })

    await hydrate(router)

    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.resolvedLocation?.pathname).toBe('/b')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: bRoute.id,
      status: 'success',
      loaderData: 'b server',
    })
    expect(bLoader).not.toHaveBeenCalled()
  })

  test('keeps the current location when the history does not follow the window', async () => {
    // A history that is not backed by `window.location` (e.g. memory or hash
    // history) has not left the document even if the window URL differs.
    mockWindow.$_TSR = await renderOnServer('/b')
    setBrowserLocation('/a', '/c')

    const { routeTree, bRoute } = createRouteTree({
      a: () => 'a client',
      b: () => 'b client',
    })
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/b'] }),
      isServer: false,
    })

    await hydrate(router)

    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: bRoute.id,
      status: 'success',
      loaderData: 'b server',
    })
  })
})
