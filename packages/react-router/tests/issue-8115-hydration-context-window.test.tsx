import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { AnyRouteMatch } from '@tanstack/router-core'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

function bootstrap(
  matches: Array<{
    id: string
    status: AnyRouteMatch['status']
    ssr: AnyRouteMatch['ssr']
    data?: unknown
    beforeLoadContext?: unknown
  }>,
): void {
  window.$_TSR = {
    router: {
      manifest: undefined,
      matches: matches.map(({ id, status, ssr, data, beforeLoadContext }) => ({
        i: dehydrateSsrMatchId(id),
        l: data,
        s: status,
        ssr,
        u: Date.now(),
        ...(beforeLoadContext !== undefined ? { b: beforeLoadContext } : {}),
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
  } as TsrSsrGlobal
}

afterEach(() => {
  cleanup()
  delete window.$_TSR
})

// The document root cannot be replaced by pending UI (it holds <html>), so a
// pending root renders its real component (Match.tsx). Hydration only merges a
// dehydrated match's beforeLoad context (`b`) for committed matches — an
// uncommitted root (id mismatch between server and client, e.g. a URL rewrite
// disagreement) therefore renders its real component with every
// beforeLoad-provided context key missing. Production impact in #8115.
describe('hydration beforeLoad context window', () => {
  test('an uncommitted hydrated document root never renders with its beforeLoad context stripped', async () => {
    const observed: Array<string> = []
    let releaseBeforeLoad!: () => void
    const beforeLoadGate = new Promise<void>((resolve) => {
      releaseBeforeLoad = resolve
    })
    const rootRoute = createRootRoute({
      beforeLoad: async () => {
        await beforeLoadGate
        return { locale: 'en' }
      },
      component: function Root() {
        observed.push(String(rootRoute.useRouteContext().locale))
        return <Outlet />
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>home</div>,
    })
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: rootRoute.addChildren([indexRoute]),
      defaultPendingComponent: () => <div>pending</div>,
      defaultPendingMs: 15,
      defaultPendingMinMs: 0,
    })
    const matches = router.matchRoutes(router.state.location)
    bootstrap([
      // The server dehydrated a different root match id than the client
      // rebuilt (a rewrite/serialization disagreement), so commitment stops at
      // index 0 and the root's `b` is never merged.
      {
        id: `${matches[0]!.id}__server-skew`,
        status: 'success',
        ssr: true,
        beforeLoadContext: { locale: 'en' },
      },
      { id: matches[1]!.id, status: 'success', ssr: true },
    ])

    // Render while hydration is still in flight (RouterProvider is public API
    // and does not require hydrate() to settle first). The document root cannot
    // be replaced by pending UI, so it renders its real component.
    const hydration = hydrate(router)
    render(<RouterProvider router={router} />)
    releaseBeforeLoad()
    await hydration
    await screen.findByText('home')

    expect(observed.length).toBeGreaterThan(0)
    expect([...new Set(observed)]).toEqual(['en'])
  })
})
