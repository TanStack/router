---
id: DeferredPromiseType
title: DeferredPromise type
---

The `DeferredPromise` type is used to describe a promise that can be resolved or rejected after it has been created.

```tsx
type DeferredPromise<T> = Promise<T> & {
  __deferredState: DeferredPromiseState<T>
}

type DeferredPromiseState<T> = { uid: string } & (
  | {
      status: 'pending'
      data?: T
      error?: unknown
    }
  | {
      status: 'success'
      data: T
    }
  | {
      status: 'error'
      data?: T
      error: unknown
    }
)
```
