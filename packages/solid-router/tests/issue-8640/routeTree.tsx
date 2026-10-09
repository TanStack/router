import { HydrationScript } from 'solid-js/web'
import { Outlet, Scripts, createRootRoute, createRoute } from '../../src'

// Shared by the server entry (compiled for SSR) and the client entry (compiled
// for hydration). The root route renders the document, as in Solid Start.
export function createRouteTree() {
  const rootRoute = createRootRoute({
    component: () => (
      <html>
        <head>
          <HydrationScript />
        </head>
        <body>
          <Outlet />
          <Scripts />
        </body>
      </html>
    ),
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    ssr: 'data-only',
    loader: () => 'dashboard data',
    pendingMinMs: 200,
    pendingComponent: () => <div data-testid="skeleton">Loading</div>,
    component: function Dashboard() {
      const data = dashboardRoute.useLoaderData()
      return <main data-testid="content">{data()}</main>
    },
  })
  return rootRoute.addChildren([dashboardRoute])
}
