---
id: AwaitOptionsType
title: AwaitOptions type
---

The `AwaitOptions` type is used to describe the options for the [`<Await>`](../awaitComponent) component and the [`useAwaited`](../useAwaitedHook) hook.

```tsx
type AwaitOptions<T> = {
  promise: DeferredPromise<T>
}
```

- [`DeferredPromise`](../DeferredPromiseType)
