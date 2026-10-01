import * as React from 'react'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import type { ScalingOptions } from '../../shared'
import type { RouterHistory } from '@tanstack/history'
import type { SearchSchemaInput } from '@tanstack/react-router'

const rootRoute = createRootRouteWithContext<ScalingOptions>()({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    page: typeof search.page === 'number' ? search.page : 0,
  }),
  component: IsolatedLayout,
})
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/' }),
  createRoute({ getParentRoute: () => rootRoute, path: '/work' }),
  createRoute({ getParentRoute: () => rootRoute, path: '/targets/$id' }),
])

// Primitive props and no route-context subscription keep the Link elements
// stable while source publications independently exercise their subscriptions.
const IsolatedGrid = React.memo(function IsolatedGrid({
  mode,
  count,
}: ScalingOptions) {
  const renders = React.useRef(0)
  renders.current += 1
  return (
    <section>
      <span data-testid="isolated-grid-renders">{renders.current}</span>
      {Array.from({ length: count }, (_, index) =>
        mode === 'repeated' ? (
          <Link
            key={index}
            to="/"
            activeOptions={{ exact: true, includeSearch: false }}
            data-scaling-link={index}
          >
            Item {index}
          </Link>
        ) : mode === 'active' ? (
          <Link
            key={index}
            to="/work"
            hash="first"
            activeOptions={{
              exact: true,
              includeSearch: false,
              includeHash: true,
            }}
            data-scaling-link={index}
          >
            Item {index}
          </Link>
        ) : (
          <Link
            key={index}
            to="/targets/$id"
            params={{ id: `item-${index}` }}
            data-scaling-link={index}
          >
            Item {index}
          </Link>
        ),
      )}
    </section>
  )
})

function IsolatedLayout() {
  const { mode, count, input } = rootRoute.useRouteContext()
  return (
    <main>
      <nav>
        {(['first', 'second'] as const).map((name) => (
          <Link
            key={name}
            to="/work"
            search={{ page: input === 'search' && name === 'second' ? 1 : 0 }}
            hash={input === 'hash' ? name : 'first'}
            activeOptions={{ exact: true, includeHash: true }}
            replace
            data-testid={`scale-${name}`}
          >
            {name}
          </Link>
        ))}
      </nav>
      <IsolatedGrid mode={mode} count={count} input={input} />
      <Outlet />
    </main>
  )
}

export function mountIsolatedFanoutApp(
  container: HTMLElement,
  history: RouterHistory,
  options: ScalingOptions,
) {
  const router = createRouter({
    routeTree,
    history,
    context: options,
    defaultPreload: false,
    defaultStaleTime: 0,
    scrollRestoration: false,
  })
  const root = createRoot(container)
  root.render(<RouterProvider router={router} />)
  return { router, unmount: () => root.unmount() }
}
