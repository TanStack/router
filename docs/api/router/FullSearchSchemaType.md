---
id: FullSearchSchemaType
title: `FullSearchSchema` type
---


This type takes a route tree and returns an expanded, optional intersection of all search schemas in the tree.

```tsx
export type FullSearchSchema<TRouteTree extends AnyRoute> = Partial<
  Expand<
    UnionToIntersection<ParseRoute<TRouteTree>['types']['fullSearchSchema']>
  >
>
```

### Example

```tsx
import { FullSearchSchema } from '@tanstack/react-router'

type SearchSchema = FullSearchSchema<typeof routeTree>
```
