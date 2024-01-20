import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  Route,
  ErrorComponent,
  Router,
  RootRoute,
  ErrorRouteProps,
  NotFoundRoute,
  notFound,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

const rootRoute = new RootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <>
        <p>
          You&apos;re using the new notFoundComponent api to handle not founds!
        </p>
        <TanStackRouterDevtools />
      </>
    )
  },
})

function RootComponent() {
  return (
    <div className="bg-gradient-to-r from-green-700 to-lime-600 text-white">
      <div className="p-2 flex gap-2 text-lg bg-black/40 shadow-xl">
        <Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>{' '}
        <Link
          to="/demo-one"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Loader Throwing Not Found
        </Link>
        <Link
          // @ts-expect-error
          to={'/no-exist'}
          activeProps={{
            className: 'font-bold',
          }}
        >
          Invalid Path
        </Link>
      </div>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  )
}
const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}

const demoRouteOne = new Route({
  getParentRoute: () => rootRoute,
  path: '/demo-one',
  component: DemoOne,
  loader: async () => {
    if (Math.random() > 0.5) {
      throw notFound()
    }
    return 'wee'
  },
  notFoundComponent: (a) => {
    return <p>404 - Not Found (local to this route)</p>
  },
})

function DemoOne() {
  return (
    <div>
      The loader of this page has a 50% chance of throwing a not found error
    </div>
  )
}

const notFoundRoute = new NotFoundRoute({
  getParentRoute: () => rootRoute,
  component: GlobalNotFound,
})

function GlobalNotFound() {
  return (
    <div className="p-2">
      <h3>404 - Not Found (GlobalNotFound component)</h3>
    </div>
  )
}

const routeTree = rootRoute.addChildren([indexRoute, demoRouteOne])

// Set up a Router instance
const router = new Router({
  routeTree,
  // notFoundRoute,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(<RouterProvider router={router} />)
}
