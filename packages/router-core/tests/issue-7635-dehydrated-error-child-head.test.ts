import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = { routes: {} }

// https://github.com/TanStack/router/issues/7635
//
// Server: `_app.beforeLoad` throws, so the server lane is capped at
// [__root, _app(error)] and the SSR document title is the error title.
// Client: hydration matches the full branch [__root, _app, child]. The
// follow-up client load must replay the dehydrated error boundary instead of
// loading the child and executing its head — otherwise the child head
// overwrites the error document title on the client.
describe('issue #7635: dehydrated parent beforeLoad error caps child head', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    ;(global as any).window = mockWindow
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (global as any).window
  })

  it('does not run child loader/head after hydrating a server error boundary', async () => {
    const serverError = new Error('App beforeLoad failed')
    const appHead = vi.fn(({ match }: any) => ({
      meta: [{ title: match.error ? 'App error title' : 'App success title' }],
    }))
    const childHead = vi.fn(() => ({
      meta: [{ title: 'Child success title' }],
    }))
    const childLoader = vi.fn(() => ({ child: 'data' }))

    const rootRoute = new BaseRootRoute({})
    const appRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      head: appHead,
      errorComponent: () => 'App error',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => appRoute,
      path: '/child',
      loader: childLoader,
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([appRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/app/child'] }),
      isServer: false,
    })

    // The dehydrated payload only contains what the server rendered:
    // the root and the _app error boundary. The child match is absent.
    const matches = router.matchRoutes(router.stores.location.get())
    const rootMatch = matches[0]!
    const appMatch = matches[1]!

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        matches: [
          {
            i: rootMatch.id,
            s: 'success' as const,
            ssr: true,
            u: Date.now(),
          },
          {
            i: appMatch.id,
            s: 'error' as const,
            e: serverError,
            ssr: true,
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

    // The follow-up client load must cap the lane at the server error
    // boundary exactly like the server did.
    await vi.waitFor(() => {
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        appRoute.id,
      ])
    })

    const committedApp = router.state.matches.find(
      (match) => match.routeId === appRoute.id,
    )
    expect(committedApp?.status).toBe('error')

    // The child was never rendered by the server; its loader and head must
    // not run on the client either.
    expect(childLoader).not.toHaveBeenCalled()
    expect(childHead).not.toHaveBeenCalled()

    // The error boundary head owns the document title.
    expect(appHead).toHaveBeenCalled()
    expect(committedApp?.meta).toEqual([{ title: 'App error title' }])
  })
})
