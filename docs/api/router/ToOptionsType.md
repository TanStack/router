---
id: ToOptionsType
title: ToOptions type
---

The `ToOptions` type contains several properties that can be used to describe a router destination.

```tsx
type ToOptions = {
  from?: ValidRoutePath | string
  to?: ValidRoutePath | string
  hash?: true | ((prev: string) => string)
  state?: true | ((prev: HistoryState) => HistoryState)
} & SearchParamOptions &
  PathParamOptions
```
