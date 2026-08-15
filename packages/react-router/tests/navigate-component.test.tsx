import * as React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import ReactDOMServer from 'react-dom/server'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

function createTestRouter(initialEntry: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/target" replace />,
  })

  // `search` as an updater function is a fresh value on every render, which is
  // the case the destination is resolved for.
  const functionSearchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/function-search',
    component: () => (
      <Navigate to="/target" search={(prev: any) => ({ ...prev })} replace />
    ),
  })

  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    component: () => <div>target</div>,
  })

  return createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      functionSearchRoute,
      targetRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
}

describe('Navigate', () => {
  // `Navigate` resolves its destination during render so it can tell whether
  // the target actually changed. Server rendering must not trip over that, even
  // though the navigation itself only runs in an effect on the client.
  test.each(['/', '/function-search'])(
    'server renders %s without throwing',
    async (initialEntry) => {
      const router = createTestRouter(initialEntry)
      router.isServer = true
      await router.load()

      expect(() =>
        ReactDOMServer.renderToString(<RouterProvider router={router} />),
      ).not.toThrow()
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Navigate in StrictMode', () => {
  // #3465 made `Navigate` issue a single navigation under StrictMode, by
  // comparing the props object by identity. That holds there only because
  // React hands both passes of the double-invoked effect the same props
  // object; it cannot hold across a real re-render, where React allocates a
  // new one. Guarding on the resolved destination has to keep #3465 working.
  test('issues a single navigation', async () => {
    const router = createTestRouter('/')
    const navigateSpy = vi.spyOn(router, 'navigate')

    render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/target'))
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(navigateSpy.mock.calls.length).toBe(1)
  })
})
