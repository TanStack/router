---
id: DeferredPromiseStateType
title: DeferredPromiseState type
---

The `DeferredPromiseState` type is used to describe the state of a deferred promise.

```tsx
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

- `uid` - A unique identifier for the promise state represented by a string.