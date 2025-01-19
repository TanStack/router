---
id: useCanGoForward
title: useCanGoForward hook
---

The `useCanGoForward` hook returns a boolean representing if the router history can safely go forward without exiting the application.

> ⚠️ The following new `useCanGoForward` API is currently _experimental_.

## useCanGoForward returns

- If the router history is not at index `router.history.length - 1`, `true`.
- If the router history is at index `router.history.length - 1`, `false`.

## Limitations

The router history index is reset after a navigation with [`reloadDocument`](./NavigateOptionsType.md#reloaddocument) set as `true`. This causes the router history to consider the new location as the initial one and might cause `useCanGoForward` to return `true`.

## Examples

### Showing a forward button

```tsx
import { useRouter, useCanGoForward } from '@tanstack/react-router'

function Component() {
  const router = useRouter()
  const canGoForward = useCanGoForward()

  return (
    <div>
      {canGoForward ? (
        <button onClick={() => router.history.forward()}>Go forward</button>
      ) : null}

      {/* ... */}
    </div>
  )
}
```
