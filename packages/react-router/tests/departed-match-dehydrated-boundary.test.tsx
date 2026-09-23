import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import { hydrate } from '../src/ssr/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
} from '../src'
import type { TsrSsrGlobal } from '../src/ssr/client'

declare global {
  interface Window {
    $_TSR?: TsrSsrGlobal
  }
}

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
  vi.restoreAllMocks()
  window.$_TSR = undefined
  document.body.innerHTML = ''
})

describe('a route that departs while its tree is still mounted', () => {
  test('navigating away before its dehydrated boundary hydrates renders the next route without errors', async () => {
    const gate: { pending?: Promise<never> } = {}

    function ClientGate() {
      if (gate.pending) {
        React.use(gate.pending)
      }
      return null
    }

    const makeRouteTree = () => {
      const rootRoute = createRootRoute({
        component: () => (
          <>
            <Link to="/b">Go to B</Link>
            <Outlet />
          </>
        ),
      })
      const aRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/a',
        loader: () => 'A data',
        component: function A() {
          return (
            <section>
              <p>{aRoute.useLoaderData()}</p>
              <Outlet />
            </section>
          )
        },
      })
      const aChildRoute = createRoute({
        getParentRoute: () => aRoute,
        path: '/child',
        component: () => (
          <>
            <ClientGate />
            <p>{`A child of ${aRoute.useLoaderData()}`}</p>
          </>
        ),
      })
      const bRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/b',
        component: () => <p>Page B</p>,
      })
      return rootRoute.addChildren([aRoute.addChildren([aChildRoute]), bRoute])
    }

    const serverRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/a/child'] }),
    })
    serverRouter.isServer = true
    await serverRouter.load()
    const serverHtml = renderToString(<RouterProvider router={serverRouter} />)
    expect(serverHtml).toContain('A data')
    expect(serverHtml).toContain('A child of A data')

    const clientRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/a/child'] }),
    })
    window.$_TSR = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: serverRouter.stores.matches.get().map((match) => ({
          i: dehydrateSsrMatchId(match.id),
          u: match.updatedAt,
          s: match.status,
          l: match.loaderData,
          e: match.error,
          ssr: match.ssr,
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }
    await hydrate(clientRouter)

    // Suspending on the client keeps the route boundary dehydrated, the way a
    // code-split route component does while its chunk downloads.
    gate.pending = new Promise<never>(() => {})

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    const errors: Array<string> = []
    const collect = (error: unknown) => {
      errors.push(
        String(error instanceof Error ? (error.cause ?? error) : error),
      )
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <RouterProvider router={clientRouter} />, {
        onCaughtError: collect,
        onUncaughtError: collect,
        onRecoverableError: collect,
      })
      testCleanups.push(async () => {
        await act(() => root.unmount())
      })
      await Promise.resolve()
    })
    expect(container).toHaveTextContent('A child of A data')

    await act(async () => {
      fireEvent.click(screen.getByText('Go to B'))
    })

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(clientRouter.state.location.pathname).toBe('/b')
    expect(screen.getAllByText('Go to B')).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test('useMatch({ from }) still throws for a departed route outside its tree', async () => {
    const rootRoute = createRootRoute({ component: Outlet })
    const aRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      component: () => <Link to="/b">Go to B</Link>,
    })
    const bRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      component: function B() {
        useMatch({ from: '/a' })
        return <p>Page B</p>
      },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([aRoute, bRoute]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<RouterProvider router={router} />)
    fireEvent.click(await screen.findByText('Go to B'))

    expect(
      await screen.findByText(
        'Invariant failed: Could not find an active match from "/a"',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Page B')).not.toBeInTheDocument()
  })
})
