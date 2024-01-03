---
id: useParentMatchesHook
title: `useParentMatches` hook
---


The `useMatches` hook returns all of the parent `RouteMatch` objects from the router from the callers position in the React component tree.

**⚠️ Note: If the router has pending matches and they are showing their pending component fallbacks, `router.state.pendingMatches` will used instead of `router.state.matches`.**

### Options

#### `opts.select`

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of `RouteMatch` objects.
