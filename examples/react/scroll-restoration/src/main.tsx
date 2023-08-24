import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  Router,
  Route,
  RootRoute,
  ScrollRestoration,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

const rootRoute = new RootRoute({
  component: () => (
    <>
      <div className="p-2 flex gap-2 sticky top-0 bg-white border-b">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{' '}
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
        <Link to="/by-element" className="[&.active]:font-bold">
          By-Element
        </Link>
      </div>
      <Outlet />
      <ScrollRestoration />
      <TanStackRouterDevtools />
    </>
  ),
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => new Promise((r) => setTimeout(r, 500)),
  component: function Index() {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
        <div className="space-y-2">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="h-[100px] p-2 rounded-lg bg-gray-100 border"
            >
              Home Item {i + 1}
            </div>
          ))}
        </div>
      </div>
    )
  },
})

const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/about',
  loader: () => new Promise((r) => setTimeout(r, 500)),
  component: function About() {
    return (
      <div className="p-2">
        <div>Hello from About!</div>
        <div className="space-y-2">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="h-[100px] p-2 rounded-lg bg-gray-100 border"
            >
              About Item {i + 1}
            </div>
          ))}
        </div>
      </div>
    )
  },
})

const byElementRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/by-element',
  loader: () => new Promise((r) => setTimeout(r, 500)),
  component: function About() {
    return (
      <div className="p-2 h-[calc(100vh-41px)] flex flex-col">
        <div>Hello from By-Element!</div>
        <div className="h-full min-h-0 flex gap-4">
          <div className="border rounded-lg p-2 overflow-auto flex-1 space-y-2">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="h-[100px] p-2 rounded-lg bg-gray-100 border"
              >
                About Item {i + 1}
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-auto flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 border rounded-lg p-2 overflow-auto"
              >
                <div className="space-y-2">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[100px] p-2 rounded-lg bg-gray-100 border"
                    >
                      About Item {i + 1}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  byElementRoute,
])

const router = new Router({ routeTree, defaultMaxAge: 0, defaultGcMaxAge: 0 })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
