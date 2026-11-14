---
id: createRouterTestingFunction
title: createRouterTesting function
---

> **Experimental:** `createRouterTesting` is experimental and subject to change. It is available for React only.

The `createRouterTesting` function creates test helpers for an app's route tree, typed from that tree. Import it from `@tanstack/react-router/testing`. The [Testing Routes guide](../../guide/testing-routes.md) shows how to use it.

## createRouterTesting options

The `createRouterTesting` function accepts a single object with the following properties.

### `routeTree` property

- Type: `AnyRoute`
- Required
- The route tree of the app. Every test router is built from a copy of it, and the helpers are typed from it.

### `render` property

- Type: `(ui: React.ReactElement) => unknown`
- Optional
- The render function of your test library, for example `render` from `@testing-library/react`. `renderInRoute` calls it with a `<RouterProvider>` element and awaits the result. Without it, `renderInRoute` throws.

### `routerOptions` property

- Type: [`RouterOptions`](./RouterOptionsType.md) without `routeTree`, `history` and `context`
- Optional
- Options for every test router, for example `Wrap`. `renderInRoute` leaves out `defaultComponent`, `defaultPendingComponent` and `defaultErrorComponent`, and sets `disableGlobalCatchBoundary`.

### `defaults` property

- Type: `{ context?: ..., routes?: RouteTestOverrides<TRouteTree> }`
- Optional
- `context`: values added to the router context of every test router. In `renderInRoute` they are the base of the route's context. Keys given here become optional in the `context` of each test.
- `routes`: [route overrides](#route-overrides) applied to every router that `createTestRouter` creates. A test's own override for a route wins, option by option. `renderInRoute` uses only the `loaderData` seeds, which become optional in each test.

## createRouterTesting returns

An object with the `createTestRouter` and `renderInRoute` functions.

### `createTestRouter` function

Creates a [`Router`](./RouterType.md) over a copy of the route tree. Every route runs the app's own options unless `routes` replaces them. The router has not loaded yet: render it with `RouterProvider`, or call `router.load()`.

It accepts an optional object with these properties:

- `location`
  - Type: [`NavigateOptions`](./NavigateOptionsType.md), checked against the route tree
  - Optional
  - Where the router starts. Defaults to `/`.
- `history`
  - Type: `RouterHistory`
  - Optional
  - A history to start from instead of `location`, for entries that are not valid navigation targets.
- `context`
  - Type: the router context of the route tree
  - Required when the router context has values that `defaults.context` does not provide
- `routes`
  - Type: `RouteTestOverrides<TRouteTree>`
  - Optional
  - [Route overrides](#route-overrides) by route id. A route that is not listed keeps the app's options.

It throws when `routes` names a route that does not exist, or gives a route both `loader` and `loaderData`.

### `renderInRoute` function

`renderInRoute(element, options)` renders `element` inside the route `options.route`, with the state the test supplies. No `context`, `beforeLoad` or `loader` option of any route runs, no route component renders, and lazy routes are not loaded. The options that derive state from the URL (`params.parse`, `validateSearch`, the `search` middlewares and `loaderDeps`) run as in the app.

`options` has these properties:

- `route`
  - Type: a route id of the route tree
  - Required
  - The route the element renders in.
- `params`
  - Type: the path params of the route
  - Required when the route has path params
- `search`
  - Type: the search params a link to the route takes
  - Required when the route requires search params
  - They go through the route's `validateSearch`.
- `context`
  - Type: the whole context of the route, as `useRouteContext` returns it
  - Required when the context has values that `defaults.context` does not provide
- `loaderData`
  - Type: the loader data of the route
  - Required when the route's loader returns data and `defaults.routes` has no seed for it
- `routes`
  - Type: `{ [routeId]: { loaderData } }` for the routes above `route`
  - Required when one of those routes has a loader that returns data and no seed in `defaults.routes`

It returns a promise of `{ router, result }`. `router` is the test router, which has loaded before the element renders. `result` is what `render` returned, awaited.

The promise rejects when no `render` function was given, when `route` does not exist, when a path param is missing, when a route on the way to `route` fails to load (for example because `validateSearch` rejects the search params), and when the location of `route` does not lead to it, as for a pathless layout route.

## Route overrides

An override for one route id. Every property is typed from that route.

| Property                                                               | Type                                              | Effect                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `beforeLoad`                                                           | The route's `beforeLoad` function type            | Replaces the route's `beforeLoad`.                                                                                         |
| `loader`                                                               | A function that returns the route's loader data   | Replaces the route's loader.                                                                                               |
| `context`                                                              | The route's `context` function type, or its value | A function replaces the route's `context` option. A value is a seed: neither `context` nor `beforeLoad` of the route runs. |
| `loaderData`                                                           | The route's loader data                           | A seed: the loader is replaced by one that returns it.                                                                     |
| `component`, `pendingComponent`, `errorComponent`, `notFoundComponent` | The route's component option types                | Replace what the route renders.                                                                                            |

Setting a property to `undefined` removes that option from the route.

## Types

`@tanstack/react-router/testing` also exports these types:

- `RouteTestOverrides<TRouteTree>`: overrides by route id, for example to check a shared override object with `satisfies`.
- `RouterTestingDefaults<TRouteTree>`: the shape of `defaults`.
- `RenderInRouteOptions<TRouteTree, TRouteId, TDefaults>`: the options of `renderInRoute` for one route.
- `RouteTestBeforeLoadFn<TRoute>`, `RouteTestLoaderFn<TRoute>` and `RouteTestContextFn<TRoute>`: the replacement functions for one route.

## Framework-independent core

`@tanstack/router-core/testing` holds the parts that do not depend on a framework. Framework packages build on it; apps use `@tanstack/react-router/testing`.

| Export                                                                   | What it does                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTestRouteTree(routeTree, ...overrideMaps)`                        | Copies a route tree and applies override maps. A later map wins, option by option.                                                                                   |
| `createIsolatedRouteTree(routeTree, { routeId, component, loaderData })` | Copies a route tree without any option that does work or renders. The route `routeId` renders `component`, and the routes in the `loaderData` map return their data. |
| `initRouteTree(routeTree)`                                               | Gives every route of a tree that no router has processed its `id`, `path`, `fullPath` and `to`.                                                                      |
| `setTestRouterLocation(router, location)`                                | Moves a router that has not loaded to a location given as navigation options.                                                                                        |
| `assertRouteTestParams(router, routeId, params)`                         | Throws when a path param of the route is missing.                                                                                                                    |
| `assertIsolatedRouteLoaded(router, routeId)`                             | Throws the error of a match that failed, or an error when the route is not matched.                                                                                  |

## Examples

```tsx
import { render } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { createRouterTesting } from '@tanstack/react-router/testing'
import { routeTree } from './routeTree.gen'

const { createTestRouter, renderInRoute } = createRouterTesting({
  routeTree,
  render,
})

// The app's lifecycle runs, except for the root route's beforeLoad.
const router = createTestRouter({
  location: { to: '/posts/$postId', params: { postId: '1' } },
  context: { locale: 'en' },
  routes: { __root__: { context: { session: { user: null } } } },
})
render(<RouterProvider router={router} />)

// No lifecycle runs. The types require the state PostHeader can read.
await renderInRoute(<PostHeader />, {
  route: '/_authed/posts/$postId',
  params: { postId: '1' },
  context: { locale: 'en', session: { user: ada }, user: ada },
  loaderData: { post },
  routes: { '/_authed': { loaderData: { unreadCount: 0 } } },
})
```
