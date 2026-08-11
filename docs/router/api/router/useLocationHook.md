---
id: useLocationHook
title: useLocation hook
---

The `useLocation` method is a hook that returns the current [`location`](./ParsedLocationType.md) object. This hook is useful for when you want to perform some side effect whenever the current location changes.

The returned location is the one that produced the matches currently being rendered, so a component only ever observes the location of the route it is rendered on. It changes together with the presentation, not when a navigation to somewhere else begins. To observe the requested location while it is still loading, read [`router.state.location`](./RouterStateType.md#location-property) instead.

## useLocation options

The `useLocation` hook accepts an optional `options` object.

### `opts.select` option

- Type: `(state: ParsedLocationType) => TSelected`
- Optional
- If supplied, this function will be called with the [`location`](./ParsedLocationType.md) object and the return value will be returned from `useLocation`.

## useLocation returns

- The current [`location`](./ParsedLocationType.md) object or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useLocation } from '@tanstack/react-router'

function Component() {
  const location = useLocation()
  //    ^ ParsedLocation

  // OR

  const pathname = useLocation({
    select: (location) => location.pathname,
  })
  //    ^ string

  // ...
}
```
