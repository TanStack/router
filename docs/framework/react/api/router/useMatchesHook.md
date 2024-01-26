---
id: useMatchesHook
title: useMatches hook
---

The `useMatches` hook returns all of the `RouteMatch` objects from the router **regardless of its callers position in the React component tree**.

### Options

#### `opts.select`

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of `RouteMatch` objects.
