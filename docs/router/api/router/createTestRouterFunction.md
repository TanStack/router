---
id: createTestRouterFunction
title: createTestRouter function
---

> **Experimental:** `createTestRouter` is experimental and subject to change. It is available for React, Solid and Vue.

The `createTestRouter` function creates a [`Router`](./RouterType.md) for a test, over a copy of the app's route tree, and lets the test replace parts of single routes. Import it from the `testing` subpath of your framework package: `@tanstack/react-router/testing`, `@tanstack/solid-router/testing` or `@tanstack/vue-router/testing`. The [Testing Routes guide](../../guide/testing-routes.md) shows how to use it.

## createTestRouter options

The `createTestRouter` function accepts the [`RouterOptions`](./RouterOptionsType.md) that [`createRouter`](./createRouterFunction.md) accepts, plus the following properties.

### `routeTree` property

- Type: `AnyRoute`
- Required
- The route tree of the app. The test router is built from a copy of it, and the other options are typed from it.

### `location` property

- Type: [`NavigateOptions`](./NavigateOptionsType.md), checked against the route tree
- Optional
- Where the router starts. It replaces the current entry of the router's history. Without it, the router starts at the current location of its history: `/` for the default memory history.

### `overrides` property

- Type: `RouteTestOverrides<TRouteTree>`
- Optional
- [Route overrides](#route-overrides) by route id. A route that is not listed keeps the app's options.

### `history` property

- Type: `RouterHistory`
- Optional
- Defaults to a memory history, not to the browser history that `createRouter` uses.

## Route overrides

An override for one route id. Every property is typed from that route. The root route's id is the exported `rootRouteId`, used as a computed key: `{ [rootRouteId]: { ... } }`.

| Property                                                               | Type                                                           | Effect                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `beforeLoad`                                                           | The route's `beforeLoad` function type                         | Replaces the route's `beforeLoad`.                                      |
| `loader`                                                               | A function that returns the route's loader data                | Replaces the route's loader.                                            |
| `context`                                                              | The route's `context` function type                            | Replaces the route's `context` option.                                  |
| `loaderData`                                                           | The route's loader data                                        | A seed: the loader is replaced by one that returns it.                  |
| `routeContext`                                                         | What the route's `context` and `beforeLoad` add to the context | A seed: neither the route's `context` option nor its `beforeLoad` runs. |
| `component`, `pendingComponent`, `errorComponent`, `notFoundComponent` | The route's component option types                             | Replace what the route renders.                                         |

Setting a property to `undefined` removes that option from the route.

## createTestRouter returns

- A [`Router`](./RouterType.md) typed with the route tree. It has not loaded yet: render it with `RouterProvider`, or call `router.load()`.

It throws when `overrides` names a route that does not exist, gives a route both `loader` and `loaderData`, gives a route `routeContext` together with `context` or `beforeLoad`, or passes a value instead of a function as `context`.

## Types

`@tanstack/react-router/testing` also exports these types:

- `RouteTestOverrides<TRouteTree>`: overrides by route id, for example to check a shared override object with `satisfies`.
- `CreateTestRouterOptions<TRouteTree, TLocation>`: the options of `createTestRouter`.
- `RouteTestBeforeLoadFn<TRoute>`, `RouteTestLoaderFn<TRoute>` and `RouteTestContextFn<TRoute>`: the replacement functions for one route.

## Framework-independent core

`@tanstack/router-core/testing` holds the parts that do not depend on a framework. The React, Solid and Vue packages are thin typed wrappers around it; apps use those.

| Export                                                                   | What it does                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTestRouterWith(createRouter, options)`                            | `createTestRouter`, given a framework's `createRouter`.                                                                                                              |
| `createIsolatedTestRouterWith(createRouter, options)`                    | `createIsolatedTestRouter`, given a framework's `createRouter`. It takes the route `component` that renders the element under test instead of `element`.             |
| `TestRouterOptions`, `IsolatedTestRouterOptions`                         | The option types, with type parameters for a framework's component and element types.                                                                                |
| `createTestRouteTree(routeTree, overrides)`                              | Copies a route tree and applies the overrides.                                                                                                                       |
| `createIsolatedRouteTree(routeTree, { routeId, component, loaderData })` | Copies a route tree without any option that does work or renders. The route `routeId` renders `component`, and the routes in the `loaderData` map return their data. |
| `initRouteTree(routeTree)`                                               | Gives every route of a tree that no router has processed its `id`, `path`, `fullPath` and `to`.                                                                      |
| `setTestRouterLocation(router, location)`                                | Moves a router that has not loaded to a location given as navigation options.                                                                                        |
| `assertRouteTestParams(router, routeId, params)`                         | Throws when a path param of the route is missing.                                                                                                                    |
| `assertIsolatedRouteLoaded(router, routeId)`                             | Throws the error of a match that failed, or an error when the route is not matched.                                                                                  |

## Examples

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, rootRouteId } from '@tanstack/react-router'
import { createTestRouter } from '@tanstack/react-router/testing'
import { routeTree } from './routeTree.gen'

const router = createTestRouter({
  routeTree,
  context: { locale: 'en' },
  location: { to: '/posts/$postId', params: { postId: '1' } },
  overrides: {
    // Seeds: neither the root route's beforeLoad nor the post loader runs.
    [rootRouteId]: { routeContext: { session: { user: ada } } },
    '/_authed/posts/$postId': { loaderData: { post } },
  },
})
render(<RouterProvider router={router} />)

await screen.findByRole('heading', { name: post.title })
```
