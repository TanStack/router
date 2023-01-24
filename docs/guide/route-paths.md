---
title: Route Paths
---

Route paths are used to match the URL in the browser address bar to routes and then extract the URL parameters. Route paths can be defined using a variety of syntaxes, each with different behaviors.

Route paths are strings that do not require a leading or trailing slash. The following are valid paths:

- `/`
- `/about`
- `about/`
- `about`
- `About`

> **Important:** Route paths are **not case-sensitive** by default. This means that `/about` and `/About` are considered the same path. This is a good thing, since this is the way most of the web works anyway! However, if you truly want to match a path with a different case, you can set a route's `caseSensitive` property to `true`.

**Leading and trailing slashes are optional because they do not affect the hierarchy of the route structure.** To build parent/child hierarchy **inside** of your path, you can use slashes inside of your route path:

- `about/me`
- `about/me/`
- `about/me/you`
- `about/me/you/`

To build route hierarchy **outside** of your route path, please use the [route configuration APIs](./route-configs).

## Root/Index Paths vs Normal Paths

A route with a path of `/` is considered the root or index route for its parent route and is used to render content for a parent route when no child path is present. For example:

```tsx
let rootRoute = createRouteConfig()

// This is the index route for the entire router
const new Route({ getParentRoute: () => indexRoute = rootRoute, path: '/' })

const new Route({ getParentRoute: () => blogRoute = rootRoute, path: 'blog' })

// This is the index route for the `/blog` route
const new Route({ getParentRoute: () => blogIndexRoute = blogRoute, path: '/' })

const routeConfig = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([blogIndexRoute]),
])
```

If you put a component in the normal (non-index) route, it will render both when its route is terminal _and_ when children are also active; children will render in its `<Outlet />`. If there is no outlet then the children will not render.

## Layout Routes

A layout route is a route that does not have a path, but allows wrapping it's child routes with wrapper elements or shared logic. See [Layout Routes](./layout-routes) for more information.
