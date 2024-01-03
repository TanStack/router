---
id: rootRouteWithContextFunction
title: rootRouteWithContext function
---

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
import { rootRouteWithContext } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

const rootRoute = rootRouteWithContext<{ queryClient: QueryClient }>()({
  // ... Route Options
})

const queryClient = new QueryClient()

const router = createRouter({
  routes: [rootRoute],
  context: {
    queryClient,
  },
})
```
