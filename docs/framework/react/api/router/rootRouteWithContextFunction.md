---
id: rootRouteWithContextFunction
title: rootRouteWithContext function
---

> 🚧 The `rootRouteWithContext` function is deprecated and will be removed in the next major version of TanStack Router. Please use the [`createRootRouteWithContext`](../createRootRouteWithContextFunction) function instead. The methods associated with this function are fully replicated on its newer.

The `rootRouteWithContext` function is a helper function that can be used to create a root route instance that requires a context type to be fulfilled when the router is created.

## rootRouteWithContext generics

The `rootRouteWithContext` function accepts a single generic argument:

### `TRouterContext` generic

- Type: `TRouterContext`
- Optional, **but recommended**.
- The context type that will be required to be fulfilled when the router is created

## rootRouteWithContext options

- No options are available for this function

## rootRouteWithContext returns

- A factory function that can be used to create a new [`RootRoute`](../RootRouteClass) instance.
- It accepts a single argument, the same as the [`createRootRoute`](../createRootRouteFunction) function.

## Examples

```tsx
import {
  rootRouteWithContext,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = rootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
  // ... root route options
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})
```
