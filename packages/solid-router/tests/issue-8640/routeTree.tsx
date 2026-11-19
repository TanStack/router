import { HydrationScript } from 'solid-js/web'
import {
  Outlet,
  Scripts,
  createRootRoute,
  createRoute,
  notFound,
} from '../../src'

export type HydrationCase = {
  name: string
  ssr: 'data-only' | false
  path: string
  dashboardLoader?: 'error' | 'notFound'
  /** Server status of each match; `+g` marks the URL not-found flag. */
  payload: Array<string>
  /** Visible once the client load commits. */
  result: string
  /** Gives `/dashboard` a pending component (default `true`). */
  pending?: boolean
}

// The same application module, compiled for the server entry and for the
// hydrating client entry. The root route renders the document, as in Solid
// Start.
export function createRouteTree(entry: HydrationCase) {
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
    ssr: entry.ssr,
    validateSearch: (search: Record<string, unknown>) => {
      if ('invalid' in search) {
        throw new Error('invalid search')
      }
      return {}
    },
    loader: () => {
      if (entry.dashboardLoader === 'error') {
        throw new Error('dashboard failed')
      }
      if (entry.dashboardLoader === 'notFound') {
        throw notFound()
      }
      return 'dashboard data'
    },
    ...(entry.pending === false
      ? {}
      : {
          pendingMinMs: 200,
          pendingComponent: () => <div data-testid="skeleton">Loading</div>,
        }),
    errorComponent: () => <p>dashboard error</p>,
    notFoundComponent: () => <p>dashboard not found</p>,
    component: function Dashboard() {
      const data = dashboardRoute.useLoaderData()
      return (
        <main>
          {data()}
          <Outlet />
        </main>
      )
    },
  })
  const childRoute = createRoute({
    getParentRoute: () => dashboardRoute,
    path: '/child',
    loader: () => {
      throw new Error('child failed')
    },
    errorComponent: () => <p>child error</p>,
    component: () => <p>child</p>,
  })
  return rootRoute.addChildren([dashboardRoute.addChildren([childRoute])])
}
