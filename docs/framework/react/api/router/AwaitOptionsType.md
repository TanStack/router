---
id: AwaitOptionsType
title: AwaitOptions type
---

The `AwaitOptions` type is used to describe the options for the [`<Await>`](./api/router/awaitComponent) component and the [`useAwaited`](./api/router/useAwaitedHook) hook.

```tsx
type AwaitOptions<T> = {
  promise: DeferredPromise<T>
}
```

- [`DeferredPromise`](./api/router/DeferredPromiseType)