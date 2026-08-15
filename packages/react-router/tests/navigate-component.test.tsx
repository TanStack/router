import { describe, expect, test } from 'vitest'
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
