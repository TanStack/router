---
id: rootRouteWithContextFunction
title: rootRouteWithContext function
---

## ⚠️ Deprecated

The `rootRouteWithContext` class is deprecated and will be removed in the next major version of TanStack Router. Please use the `createRootRouteWithContext` function instead.

The `rootRouteWithContext` function is a helper function that can be used to create a root route instance that requires a context type to be fulfilled when the router is created.

### Generics

#### `TRouterContext`

- The context type that will be required to be fulfilled when the router is created

### Options

- No options are available for this function

### Returns

- A `RootRoute` factory function that can be used to create a root route instance

### Examples

```tsx
import { rootRouteWithContext, createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

const rootRoute = rootRouteWithContext<{ queryClient: QueryClient }>()({
  // ... Route Options
})

const routeTree = rootRoute.addChildren([
  // ... Other routes
])

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})
```
