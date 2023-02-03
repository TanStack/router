import {
  Link,
  Outlet,
  RootRoute,
  Route,
  RouterProvider,
  SolidRouter,
} from '@tanstack/solid-router'
import { Component } from 'solid-js'

const rootRoute = new RootRoute({
  component: () => {
    return (
      <>
        <div class="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              class: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/posts"
            activeProps={{
              class: 'font-bold',
            }}
          >
            Posts
          </Link>
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
  component: () => {
    return (
      <div class="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const postRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: () => {
    return (
      <div class="p-2">
        <h3>Welcome to Post!</h3>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([indexRoute, postRoute])

const router = new SolidRouter({
  routeTree,
  defaultPreload: 'intent',
})

const Root: Component = () => {
  return (
    <RouterProvider router={router}>
      <></>
    </RouterProvider>
  )
}

export default Root
