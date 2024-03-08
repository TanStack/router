---
id: RouteByIdType
title: RouteById type
---

This type takes a route tree and a route ID and returns the route in the tree that matches the ID.

```tsx
export type RouteById<TRouteTree extends AnyRoute, TId> = Extract<
  ParseRoute<TRouteTree>,
  { id: TId }
>
```

## Examples

```tsx
import { RouteById } from '@tanstack/react-router'

type Route = RouteById<typeof routeTree, '/auth/posts'>
```
