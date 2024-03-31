---
id: RouteIdsType
title: RouteIds type
---

This type takes a route tree and returns a union of all of the route IDs in the tree.

```tsx
export type RouteIds<TRouteTree extends AnyRoute> = ParseRoute<TRouteTree>['id']
```

## Examples

```tsx
import { RouteIds } from '@tanstack/react-router'

type RouteId = RouteIds<typeof routeTree>
```
