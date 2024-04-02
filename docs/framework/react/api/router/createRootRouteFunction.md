---
id: createRootRouteFunction
title: createRootRoute function
---

The `createRootRoute` function returns a new [`RootRoute`](../RootRouteClass) instance. A root route instance can then be used to create a route tree.

## createRootRoute options

- Type:

```tsx
Omit<
  RouteOptions,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
>
```

- [`RouteOptions`](../RouteOptionsType)
- Required
- The options that will be used to configure the root route instance

## createRootRoute returns

- A new [`RootRoute`](../RootRouteClass) instance.

## Examples

```tsx
import { createRootRoute, createRouter, Outlet } from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  // ... root route options
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const router = createRouter({
  routeTree,
})
```
