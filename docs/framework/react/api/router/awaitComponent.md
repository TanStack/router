---
id: awaitComponent
title: Await component
---

The `Await` component is a component that suspends until the provided promise is resolved or rejected.

### Props

#### `props.promise`

- Type: `DeferredPromise<T>`
- Required
- The deferred promise to await

#### `props.children`

- Type: `(result: T) => React.ReactNode`
- Required
- A function that will be called with the resolved value of the promise

### Returns

- Throws an error if the promise is rejected
- Suspends (throws a promise) if the promise is pending
- Returns the resolved value of a deferred promise if the promise is resolved

### Examples

```tsx
import { Await } from '@tanstack/react-router'

function Component() {
  const { deferredPromise } = route.useLoaderData()
  return (
    <Await promise={myDeferredPromise}>{(data) => <div>{data}</div>}</Await>
  )
}
```
