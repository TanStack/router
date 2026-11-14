---
id: createIsolatedTestRouterFunction
title: createIsolatedTestRouter function
---

> **Experimental:** `createIsolatedTestRouter` is experimental and subject to change. It is available for React, Solid and Vue.

The `createIsolatedTestRouter` function creates a [`Router`](./RouterType.md) that renders one element inside one route of the app's route tree, with the state the test supplies. Import it from the `testing` subpath of your framework package: `@tanstack/react-router/testing`, `@tanstack/solid-router/testing` or `@tanstack/vue-router/testing`. The [Testing Routes guide](../../guide/testing-routes.md) shows how to use it.

No `context`, `beforeLoad` or `loader` option of any route runs, no route component renders, and lazy routes are not loaded. The options that derive state from the URL (`params.parse`, `validateSearch`, the `search` middlewares and `loaderDeps`) run as in the app.

## createIsolatedTestRouter options

The `createIsolatedTestRouter` function accepts the following properties, plus the [`RouterOptions`](./RouterOptionsType.md) that [`createRouter`](./createRouterFunction.md) accepts, except `history`, `context` and `search`. It leaves out `defaultComponent`, `defaultPendingComponent`, `defaultErrorComponent` and `defaultNotFoundComponent`, and sets `disableGlobalCatchBoundary`.

### `routeTree` property

- Type: `AnyRoute`
- Required
- The route tree of the app. The other options are typed from it.

### `route` property

- Type: a route id of the route tree
- Required
- The route the element renders in. For the root route, pass the exported `rootRouteId`.

### `element` property

- Type: React: `React.ReactElement`. Solid: `() => JSX.Element`, because Solid evaluates JSX right away. Vue: `VNode`.
- Required
- The element under test. It renders in place of the route's component.

### `params` property

- Type: the path params of the route
- Required when the route has path params

### `search` property

- Type: the search params a link to the route takes
- Required when the route requires search params
- They go through the route's `validateSearch`.

### `context` property

- Type: the whole context of the route, as `useRouteContext` returns it
- Required when the context has values

### `loaderData` property

- Type: loader data by route id, for the route and the routes above it
- Required when one of these routes has a loader that returns data. Each such route needs an entry; the root route's key is `[rootRouteId]`.

## createIsolatedTestRouter returns

- A promise of a [`Router`](./RouterType.md) typed with the route tree. It resolves once the router has loaded, so the first render of `<RouterProvider router={router} />` is complete.

The promise rejects when `route` does not exist, when a path param is missing, when a route on the way to `route` fails to load (for example because `validateSearch` rejects the search params), and when the location of `route` does not lead to it, as for a pathless layout route.

## Types

`@tanstack/react-router/testing` also exports these types:

- `IsolatedRouteState<TRouteTree, TRouteId>`: `route`, `params`, `search`, `context` and `loaderData` for one route.
- `CreateIsolatedTestRouterOptions<TRouteTree, TRouteId>`: the options of `createIsolatedTestRouter`.

For the framework-independent parts, see [`createTestRouter`](./createTestRouterFunction.md#framework-independent-core).

## Examples

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { createIsolatedTestRouter } from '@tanstack/react-router/testing'
import { routeTree } from './routeTree.gen'

const router = await createIsolatedTestRouter({
  routeTree,
  route: '/_authed/posts/$postId',
  element: <PostHeader />,
  params: { postId: '1' },
  context: { locale: 'en', session: { user: ada }, user: ada },
  loaderData: {
    '/_authed': { unreadCount: 0 },
    '/_authed/posts/$postId': { post },
  },
})
render(<RouterProvider router={router} />)

screen.getByRole('heading', { name: post.title })
```
