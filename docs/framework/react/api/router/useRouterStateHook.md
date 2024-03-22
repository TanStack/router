---
id: useRouterStateHook
title: useRouterState hook
---

The `useRouterState` method is a hook that returns the current internal state of the router. This hook is useful for accessing the current state of the router in a component.

## useRouterState options

The `useRouterState` hook accepts an optional `options` object.

### `opts.select` option

- Type: `(state: RouterState) => TSelected`
- Optional
- If supplied, this function will be called with the [RouterState](./api/router/RouterStateType) object and the return value will be returned from `useRouterState`.

## useRouterState returns

- The current [RouterState](./api/router/RouterStateType) object or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useRouterState } from '@tanstack/react-router'

function Component() {
  const state = useRouterState()
  //    ^ RouterState

  // OR

  const selected = useRouterState({
    select: (state) => state.location,
  })
  //    ^ ParsedLocation

  // ...
}
```
