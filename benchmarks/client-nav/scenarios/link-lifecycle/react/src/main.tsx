import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { createRoot } from 'react-dom/client'
import {
  linkCount,
  readyTestId,
  scalingKind,
  scalingReadyTestId,
} from '../../shared'
import type { LinkPlacement, ScalingOptions } from '../../shared'
import type { RouterHistory } from '@tanstack/history'
import type { SearchSchemaInput } from '@tanstack/react-router'

export const serverEnvironment = isServer
export { mountFormatterApp } from './formatter'
export { mountIsolatedFanoutApp } from './isolated-fanout'

const rootRoute = createRootRouteWithContext<{ placement: LinkPlacement }>()({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    page: typeof search.page === 'number' ? search.page : 0,
  }),
  component: RootLayout,
})
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async () => {
    await Promise.resolve()
  },
  component: () => <OwnerPage name="home" />,
})
const awayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/away',
  loader: async () => {
    await Promise.resolve()
  },
  component: () => <OwnerPage name="away" />,
})
const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
})
const routeTree = rootRoute.addChildren([homeRoute, awayRoute, itemRoute])

function LinkGrid() {
  return (
    <div>
      {Array.from({ length: linkCount }, (_, index) => (
        <Link
          key={index}
          to="/items/$id"
          params={{ id: `item-${index}` }}
          search={(search: { page?: number }) => ({
            page: (search.page ?? 0) + (index % 5),
          })}
          data-lifecycle-link={index}
        >
          Item {index}
        </Link>
      ))}
    </div>
  )
}

function RootLayout() {
  const { placement } = rootRoute.useRouteContext()
  return (
    <>
      <nav>
        <Link
          to="/"
          search={{ page: 0 }}
          replace
          activeOptions={{ exact: true, includeSearch: false }}
          data-testid="go-home"
        >
          Home
        </Link>
        <Link
          to="/away"
          search={{ page: 1 }}
          replace
          activeOptions={{ exact: true, includeSearch: false }}
          data-testid="go-away"
        >
          Away
        </Link>
      </nav>
      {placement === 'root' ? <LinkGrid /> : null}
      <Outlet />
    </>
  )
}

function OwnerPage({ name }: { name: 'home' | 'away' }) {
  const { placement } = rootRoute.useRouteContext()
  return (
    <main>
      <p data-testid={readyTestId}>{name}</p>
      {placement === 'owner' ? <LinkGrid /> : null}
    </main>
  )
}

export function mountTestApp(
  container: HTMLElement,
  history: RouterHistory,
  placement: LinkPlacement = 'owner',
) {
  const router = createRouter({
    routeTree,
    history,
    context: { placement },
    defaultPreload: false,
    defaultStaleTime: 0,
    scrollRestoration: false,
  })
  const root = createRoot(container)
  root.render(<RouterProvider router={router} />)
  return { router, unmount: () => root.unmount() }
}

// A separate tree keeps the original lifecycle workload unchanged.
const scalingRoot = createRootRouteWithContext<ScalingOptions>()({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    page: typeof search.page === 'number' ? search.page : 0,
  }),
  component: ScalingLayout,
})
const scalingTree = scalingRoot.addChildren([
  createRoute({ getParentRoute: () => scalingRoot, path: '/' }),
  createRoute({ getParentRoute: () => scalingRoot, path: '/work' }),
  createRoute({ getParentRoute: () => scalingRoot, path: '/targets/$id' }),
])

function ScalingLayout() {
  const { mode, count, input } = scalingRoot.useRouteContext()
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
      <div>
        {Array.from({ length: count }, (_, index) => {
          const kind = scalingKind(mode, index)
          if (kind === 'repeated' || kind === 'active') {
            return (
              <Link
                key={index}
                to={kind === 'repeated' ? '/' : '/work'}
                activeOptions={{ exact: true, includeSearch: false }}
                data-scaling-link={index}
              >
                Item {index}
              </Link>
            )
          }
          return (
            <Link
              key={index}
              to="/targets/$id"
              params={{ id: `item-${index}` }}
              search={
                kind === 'dynamic'
                  ? (search: { page?: number }) => ({ page: search.page ?? 0 })
                  : undefined
              }
              hash={kind === 'dynamic' ? true : undefined}
              data-scaling-link={index}
            >
              Item {index}
            </Link>
          )
        })}
      </div>
      <p data-testid={scalingReadyTestId}>Ready</p>
      <Outlet />
    </main>
  )
}

export function mountScalingApp(
  container: HTMLElement,
  history: RouterHistory,
  options: ScalingOptions,
) {
  const router = createRouter({
    routeTree: scalingTree,
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
