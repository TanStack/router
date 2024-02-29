---
id: RouteByPathType
title: RouteByPath type
---

This type takes a route tree and a path and returns the route in the tree that matches the path.

```tsx
export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  ParseRoute<TRouteTree>,
  { fullPath: TPath }
>
```

## Examples

```tsx
import { RouteByPath } from '@tanstack/react-router'

type Route = RouteByPath<typeof routeTree, '/posts'>
```
