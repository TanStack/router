---
id: DeferredPromiseType
title: DeferredPromise type
---

```tsx
type DeferredPromise<T> = Promise<T> & {
  __deferredState: DeferredPromiseState<T>
}
```
