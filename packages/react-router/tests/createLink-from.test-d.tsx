import { expectTypeOf, test } from 'vitest'
import React from 'react'
import {
  createLink,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

// Simple route tree:
// /
// /dashboard
// /dashboard/settings
// /dashboard/users
// /dashboard/users/$userId
// /posts

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
})

const settingsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'settings',
})

const usersRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'users',
})

const userRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '$userId',
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute.addChildren([
    settingsRoute,
    usersRoute.addChildren([userRoute]),
  ]),
  postsRoute,
])

const router = createRouter({ routeTree })

declare module '../src' {
  interface Register {
    router: typeof router
  }
}

// Custom component for createLink
const Button = (props: { children?: React.ReactNode }) => (
  <button {...props} />
)

test('createLink with from allows valid relative paths', () => {
  const DashboardLink = createLink(Button, { from: '/dashboard' })

  // Valid: ./settings exists under /dashboard
  ;<DashboardLink to="./settings">Settings</DashboardLink>

  // Valid: ./users exists under /dashboard
  ;<DashboardLink to="./users">Users</DashboardLink>

  // Valid: absolute paths always work
  ;<DashboardLink to="/posts">Posts</DashboardLink>

  // Valid: parent navigation
  ;<DashboardLink to="..">Home</DashboardLink>
})

test('createLink with from rejects invalid relative paths', () => {
  const DashboardLink = createLink(Button, { from: '/dashboard' })

  // @ts-expect-error - ./posts does NOT exist under /dashboard
  ;<DashboardLink to="./posts">Invalid</DashboardLink>

  // @ts-expect-error - ./invalid is not a valid child of /dashboard
  ;<DashboardLink to="./invalid">Invalid</DashboardLink>
})

test('createLink with from requires params for parameterized routes', () => {
  const UsersLink = createLink(Button, { from: '/dashboard/users' })

  // Valid: navigating to $userId with params
  ;<UsersLink to="./$userId" params={{ userId: '123' }}>
    User
  </UsersLink>

  // @ts-expect-error - missing required userId param
  ;<UsersLink to="./$userId">User</UsersLink>
})
