---
id: SearchParamOptionsType
title: SearchParamOptions type
---

The `SearchParamOptions` type is used to describe how search params can be provided or transformed to various navigational APIs in TanStack Router.

```tsx
type SearchParamOptions = {
  search?: true
    | TToSearch
    | ((prev: TFromSearch) => TToSearch)
}
```
