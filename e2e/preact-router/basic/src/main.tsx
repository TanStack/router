import { render } from 'preact'
import { useMemo } from 'preact/hooks'
import {
  Await,
  Link,
  Outlet,
  RouterProvider,
  Suspense,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/preact-router'

const rootRoute = createRootRoute({
  component: () => (
    <div>
      <nav>
        <Link to="/" activeOptions={{ exact: true }}>
          Home
        </Link>{' '}
        <Link to="/slow">Slow</Link>
      </nav>
      <Outlet />
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <h1 data-testid="home">Home</h1>,
})

const slowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/slow',
  component: SlowRouteComponent,
})

function SlowRouteComponent() {
  const promise = useMemo(
    () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('Loaded!'), 200)
      }),
    [],
  )

  return (
    <div>
      <h1 data-testid="slow-title">Slow Route</h1>
      <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
        <Await promise={promise}>
          {(value) => <div data-testid="suspense-content">{value}</div>}
        </Await>
      </Suspense>
    </div>
  )
}

const routeTree = rootRoute.addChildren([indexRoute, slowRoute])

const router = createRouter({
  routeTree,
})

render(<RouterProvider router={router} />, document.getElementById('app')!)
