import * as React from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

const rootRoute = createRootRoute({
  component: function RootComponent() {
    return (
      <React.Fragment>
        <div className="flex gap-4">
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
        </div>
        <Outlet />
        <TanStackRouterDevtools />
      </React.Fragment>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Component() {
    return (
      <div className="content">
        <h1 className="text-4xl">Index Rsbuild with React</h1>
        <p>Start building amazing things with Rsbuild.</p>
      </div>
    )
  },
})
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
  component: function Component() {
    return (
      <div className="content">
        <h1 className="text-4xl">About Rsbuild with React</h1>
        <p>Start building amazing things with Rsbuild.</p>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren({ indexRoute, aboutRoute })

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
const App = () => {
  return <RouterProvider router={router} />
}

export default App
