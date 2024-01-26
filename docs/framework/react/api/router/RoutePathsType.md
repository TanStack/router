---
id: RoutePathsType
title: RoutePaths type
---

This type takes a route tree and returns a union of all of the full paths in the tree.

```tsx
export type RoutePaths<TRouteTree extends AnyRoute> =
  | ParseRoute<TRouteTree>['fullPath']
  | '/'
```

### Example

```tsx
import { RoutePaths } from '@tanstack/react-router'

type RoutePath = RoutePaths<typeof routeTree>
```
