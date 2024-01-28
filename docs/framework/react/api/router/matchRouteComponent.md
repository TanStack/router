---
id: matchRouteComponent
title: MatchRoute component
---

A component version of the `useMatchRoute` hook. It accepts the same options as the `useMatchRoute` with additional props to aid in conditional rendering.

### Props

#### `...props`

- Type: `UseMatchRouteOptions`

#### `children`

- Optional
- `JSX.Element`
  - The component that will be rendered if the route is matched
- `((params: TParams | false) => JSX.Element)`
  - A function that will be called with the matched route's params or `false` if no route was matched. This can be useful for components that need to always render, but render different props based on a route match or not.

### Returns

Either the `children` prop or the return value of the `children` function.
