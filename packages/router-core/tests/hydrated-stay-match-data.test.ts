import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = { routes: {} }

describe('hydrated stay match data preservation', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    ;(global as any).window = mockWindow
  })

  afterEach(() => {
    delete (global as any).window
    vi.restoreAllMocks()
  })

  it('keeps server loader data on a stay match during ordinary client loading', async () => {
    const rootLoader = vi.fn(() => ({ root: 'client' }))
    const history = createMemoryHistory({ initialEntries: ['/a'] })

    const rootRoute = new BaseRootRoute({ loader: rootLoader })
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      ssr: false,
      loader: () => 'a client data',
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      loader: () => 'b client data',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute, bRoute]),
      history,
      isServer: false,
    })

    const matches = router.matchRoutes(router.stores.location.get())
    const rootMatch = matches[0]!

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        matches: [
          {
            i: rootMatch.id,
            s: 'success' as const,
            ssr: true,
            l: { root: 'server' },
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)
    await router.load()

    expect(
      router.state.matches.find((m) => m.routeId === aRoute.id)?.loaderData,
    ).toBe('a client data')
    expect(rootLoader).not.toHaveBeenCalled()
    expect(
      router.state.matches.find((m) => m.routeId === rootRoute.id)?.loaderData,
    ).toEqual({ root: 'server' })

    // Client-side navigation: root is a stay match and must keep server data.
    await router.navigate({ to: '/b' })

    expect(
      router.state.matches.find((m) => m.routeId === bRoute.id)?.loaderData,
    ).toBe('b client data')
    expect(rootLoader).not.toHaveBeenCalled()
    expect(
      router.state.matches.find((m) => m.routeId === rootRoute.id)?.loaderData,
    ).toEqual({ root: 'server' })
  })
})
