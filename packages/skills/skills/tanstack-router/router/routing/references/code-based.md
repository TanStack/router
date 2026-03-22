# Code-Based Routing

Define routes programmatically without file-based generation.

## Basic Setup

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

// Root route
const rootRoute = createRootRoute({
  component: RootLayout,
})

// Child routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  component: PostsLayout,
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ params }) => fetchPost(params.postId),
  component: Post,
})

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postRoute]),
])

// Create router
const router = createRouter({ routeTree })
```

## createRootRoute

The root route wraps all other routes:

```tsx
const rootRoute = createRootRoute({
  component: () => (
    <div>
      <nav>...</nav>
      <Outlet />
    </div>
  ),
  errorComponent: GlobalError,
  notFoundComponent: NotFound,
})
```

## createRoute Options

```tsx
const route = createRoute({
  getParentRoute: () => parentRoute,
  path: 'posts/$postId',

  // Validation
  validateSearch: searchSchema,
  params: { parse: (p) => p, stringify: (p) => p },

  // Data loading
  loader: async ({ params, search, context }) => data,
  beforeLoad: async ({ context }) => {
    /* guards */
  },

  // Components
  component: Component,
  pendingComponent: Loading,
  errorComponent: Error,
  notFoundComponent: NotFound,
})
```

## Pathless Routes

Routes without path segments (for layouts):

```tsx
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated', // Use id instead of path
  beforeLoad: authGuard,
  component: AuthLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'dashboard',
  component: Dashboard,
})
```

## Type Registration

Register router for type inference:

```tsx
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```
