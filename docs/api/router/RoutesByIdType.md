---
id: RoutesByIdType
title: RoutesById type
---

This type takes a route tree and returns a Record of all routes in the tree keyed by their route ID.

```tsx
export type RoutesById<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['id']]: K
}
```

### Example

```tsx
import { RoutesById } from '@tanstack/react-router'

type Routes = RoutesById<typeof routeTree>
```
