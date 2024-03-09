---
id: PathParamOptionsType
title: PathParamOptions type
---

The `PathParamOptions` type is used to describe how path params can be provided or transformed to various navigational APIs in TanStack Router.

```tsx
type PathParamOptions = {
  path?: true | Record<string, TPathParam> | ((prev: TFromParams) => TToParams)
}
```
