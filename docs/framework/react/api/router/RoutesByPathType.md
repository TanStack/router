---
id: RoutesByPathType
title: RoutesByPath type
---

This type takes a route tree and returns a Record of all routes in the tree keyed by their full path.

```tsx
export type RoutesByPath<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['fullPath']]: K
}
```

### Example

```tsx
import { RoutesByPath } from '@tanstack/react-router'

type Routes = RoutesByPath<typeof routeTree>
```
