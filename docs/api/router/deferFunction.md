---
id: deferFunction
title: defer function
---

The `defer` function wraps a promise with a deferred state object that can be used to inspect the promise's state. This deferred promise can then be passed to the `useAwaited` hook or the `Await` component for suspending until the promise is resolved or rejected.

### Options

#### `_promise`

- Type: `Promise<T>`
- Required
- The promise to wrap with a deferred state object

### Returns

- A `DeferredPromise<T>` that can be passed to the `useAwaited` hook or the `Await` component

### Examples

```tsx
import { defer } from '@tanstack/react-router'

const route = new Route({
  loader: () => {
    const deferredPromise = defer(fetch('/api/data'))
    return { deferredPromise }
  },
  compoennt: MyComponent,
})

function MyComponent() {
  const data = useAwaited({ promise: deferredPromise })

  // or

  return <Await promise={deferredPromise}>{(data) => <div>{data}</div>}</Await>
}
```
