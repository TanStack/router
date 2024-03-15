---
id: useMatchHook
title: useMatch hook
---

The `useMatch` hook returns the closest [`RouteMatch`](./api/router/RouteMatchType) in the component tree. The raw route match contains all of the information about a route match in the router and also powers many other hooks under the hood like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch`.

## useMatch options

The `useMatch` hook accepts a single argument, an `options` object.

### `opts.from` option

- Type: `string`
- The route id of the closest parent match
- Optional, but recommended for full type safety.
- If `opts.strict` is `true`, `from` is required and TypeScript will warn for this option if it is not provided.
- If `opts.strict` is `false`, `from` must not be set and TypeScript will provided loosened types for the returned [`RouteMatch`](./api/router/RouteMatchType).

### `opts.strict` option

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` must not be set and types will be loosened to `Partial<RouteMatch>` to reflect the shared types of all matches.

### `opts.select` option

- Optional
- `(match: RouteMatch) => TSelected`
- If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

## useMatch returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the [`RouteMatch`](./api/router/RouteMatchType) object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.

## Examples

```tsx
import { useMatch } from '@tanstack/react-router'

function Component() {
  const match = useMatch({ from: '/posts/$postId', strict: true })
  //     ^? strict match for RouteMatch
  // ...
}
```
