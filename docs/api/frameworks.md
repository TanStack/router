---
title: Frameworks
---

## FrameworkGenerics

The `FrameworksGenerics` interface is available for framework adapters to extend the internal types used by the core router instance.

Primarily these include:

- Element
- SyncOrAsyncElement

Internally, the `GetFrameworkGeneric` function is used to retrieve these generics.

```tsx
export interface FrameworkGenerics {
  // The following properties are used internally
  // and are extended by framework adapters, but cannot be
  // pre-defined as constraints:
  //
  // Element: any
  // SyncOrAsyncElement?: any
}

export type GetFrameworkGeneric<U> = U extends keyof FrameworkGenerics
  ? FrameworkGenerics[U]
  : any
```
