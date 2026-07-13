import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate } from '@tanstack/router-core/ssr/client'
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
    match: AnyRouteMatch
    status: AnyRouteMatch['status']
    ssr: AnyRouteMatch['ssr']
    data?: unknown
    error?: unknown
  }>,
): void {
  window.$_TSR = {
    router: {
      manifest: undefined,
      matches: matches.map(({ match, status, ssr, data, error }) => ({
        i: match.id,
        l: data,
        e: error,
        s: status,
        ssr,
        u: Date.now(),
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

describe('hydration terminal lane', () => {
  test('keeps server data while loading only the missing client suffix', async () => {
    const rootRoute = createRootRoute({ component: Outlet })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'client-parent',
      component: () => (
        <>
          <div>{parentRoute.useLoaderData()}</div>
          <Outlet />
        </>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      ssr: false,
      loader: () => 'client-child',
      component: () => <div>{childRoute.useLoaderData()}</div>,
    })
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    })
    const matches = router.matchRoutes(router.state.location)
    bootstrap([
      { match: matches[0]!, status: 'success', ssr: true },
      {
        match: matches[1]!,
        status: 'success',
        ssr: true,
        data: 'server-parent',
      },
      { match: matches[2]!, status: 'pending', ssr: false },
    ])

    await hydrate(router)
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('server-parent')).toBeInTheDocument()
    expect(await screen.findByText('client-child')).toBeInTheDocument()
    expect(screen.queryByText('client-parent')).not.toBeInTheDocument()
  })

  test('does not render serialized descendants below a server error', async () => {
    const rootRoute = createRootRoute({ component: Outlet })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      errorComponent: ({ error }) => <div>Parent failed: {error.message}</div>,
      component: Outlet,
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      component: () => <div>Child must stay omitted</div>,
    })
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    })
    const matches = router.matchRoutes(router.state.location)
    bootstrap([
      { match: matches[0]!, status: 'success', ssr: true },
      {
        match: matches[1]!,
        status: 'error',
        ssr: true,
        error: new Error('server boom'),
      },
      { match: matches[2]!, status: 'success', ssr: true },
    ])

    await hydrate(router)
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Parent failed: server boom')).toBeVisible()
    expect(
      screen.queryByText('Child must stay omitted'),
    ).not.toBeInTheDocument()
  })
})
