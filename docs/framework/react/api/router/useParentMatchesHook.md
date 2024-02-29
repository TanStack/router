---
id: useParentMatchesHook
title: useParentMatches hook
---

The `useParentMatches` hook returns all of the parent [`RouteMatch`](./api/router/RouteMatchType) objects from the root down to the immediate parent of the current match in context. **It does not include the current match, which can be obtained using the `useMatch` hook.**

> ⚠️ Note: If the router has pending matches and they are showing their pending component fallbacks, `router.state.pendingMatches` will used instead of `router.state.matches`.

## useParentMatches `options`

The `useParentMatches` hook accepts an optional `options` object.

### `opts.select` option

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useParentMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

## useParentMatches `returns`

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of [`RouteMatch`](./api/router/RouteMatchType) objects.

## Examples

```tsx
import { useParentMatches } from '@tanstack/react-router'

function Component() {
  const parentMatches = useParentMatches()
  //    ^ [RouteMatch, RouteMatch, ...]
}
```
