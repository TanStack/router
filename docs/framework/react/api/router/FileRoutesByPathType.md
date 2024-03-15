---
id: FileRoutesByPathType
title: FileRoutesByPath type
---

The `FileRoutesByPath` type is dynamically used with declaration merging to map file paths to their corresponding route and parent route types. These types are then used to create the generated route tree types.

```tsx
export interface FileRoutesByPath {
  // Empty by default,
  // but is dynamically populated by declaration merging
  // during route generation from the generated route tree file.
  //
  // Example:
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}
```
