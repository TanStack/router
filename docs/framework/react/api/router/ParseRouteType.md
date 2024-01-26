---
id: ParseRouteType
title: ParseRoute type
---

This type recursively parses a route and all of its children and grandchildren into a single union of all possible routes.

```tsx
export type ParseRoute<TRouteTree extends AnyRoute> =
  | TRouteTree
  | ParseRouteChildren<TRouteTree>
```
