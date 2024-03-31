---
id: AllParamsType
title: AllParams type
---

This type takes a route tree and returns an expanded, optional intersection of all params in the tree.

```tsx
export type AllParams<TRouteTree extends AnyRoute> = Expand<
  UnionToIntersection<ParseRoute<TRouteTree>['types']['allParams']>
>
```

### Examples

```tsx
import { AllParams } from '@tanstack/react-router'

type Params = AllParams<typeof routeTree>
```
