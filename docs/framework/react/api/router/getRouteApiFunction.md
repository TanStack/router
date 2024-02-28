---
id: getRouteApiFunction
title: getRouteApi function
---

The `getRouteApi` function provides type-safe version of common hooks like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch` that are pre-bound to a specific route ID and corresponding registered route types.

## getRouteApi `options`

The `getRouteApi` function accepts a single argument, a `routeId` string literal.

### `routeId` option

- Type: `string`
- Required
- The route ID to which the [`RouteApi`](./api/router/RouteApiClass) instance will be bound

## getRouteApi `returns`

- A [`RouteApi`](./api/router/RouteApiClass) instance that is pre-bound to the route ID that the `getRouteApi` function was called with.

## Examples

```tsx
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/posts')

export function PostsPage() {
  const posts = routeApi.useLoaderData()
  // ...
}
```