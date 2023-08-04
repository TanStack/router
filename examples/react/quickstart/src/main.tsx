import React, { StrictMode, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  Router,
  Route,
  RootRoute,
  lazyRouteComponent,
  SyncRouteComponent,
} from '@tanstack/router'

const rootRoute = new RootRoute({
  component: () => {
    return (
      <>
        <div>
          <Link to="/">Home</Link>
          <br />
          <Link to="/lazy-without-suspsense">Lazy without suspense</Link>
          <br />
          <Link to="/lazy-with-suspsense">Lazy with suspense</Link>
          <br />
          <Link to="/with-loader">With loader</Link>
        </div>
        <hr />
        <Outlet />
      </>
    )
  },
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Index() {
    return <h1>Hello world from "home"</h1>
  },
})

const lazyWithoutSuspense = new Route({
  getParentRoute: () => rootRoute,
  path: '/lazy-without-suspsense',
  component: lazyRouteComponent(
    () =>
      new Promise<Record<string, SyncRouteComponent<any>>>((res) => {
        setTimeout(() => {
          res({
            default: () => <h1>Hello world from "lazy-without-suspense"</h1>,
          })
        }, 1500)
      }),
  ),
})

const lazyWithSuspense = new Route({
  getParentRoute: () => rootRoute,
  path: '/lazy-with-suspsense',
  component: lazyRouteComponent(
    () =>
      new Promise<Record<string, SyncRouteComponent<any>>>((res) => {
        setTimeout(() => {
          res({
            default: () => <h1>Hello world from "lazy-with-suspense"</h1>,
          })
        }, 1500)
      }),
  ),
  pendingComponent: () => <h1>I'm loading</h1>,
  wrapInSuspense: true,
})

const withLoader = new Route({
  getParentRoute: () => rootRoute,
  path: '/with-loader',
  loader: () => new Promise((res) => setTimeout(res, 1000)),
  component: () => <h1>Hello world from "with-laoder"</h1>,
  wrapInSuspense: true,
  pendingComponent: () => <h1>I'm loading</h1>,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  lazyWithoutSuspense,
  lazyWithSuspense,
  withLoader,
])

const router = new Router({
  routeTree,
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<RouterProvider router={router} />)
}
