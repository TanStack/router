---
id: useMatchHook
title: useMatch hook
---

The `useMatch` hook returns the closest `RouteMatch` in the component tree. The raw route match contains all of the information about a route match in the router and also powers many other hooks under the hood like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch`.

### Options

#### `opts.from`

- Type: `string`
- The route id of the closest parent match
- Optional, but recommended for full type safety.
- If `opts.strict` is `true`, TypeScript will warn for this option if it is not provided.
- If `opts.strict` is `false`, TypeScript will provided loosened types for the returned `RouteMatch`.

#### `opts.strict`

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<RouteMatch>` to reflect the shared types of all matches.

#### `opts.select`

- Optional
- `(match: RouteMatch) => TSelected`
- If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the `RouteMatch` object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.
