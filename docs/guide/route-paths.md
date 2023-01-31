---
title: Route Paths
---

Route `path`s are used to match parts of a URL's pathname to a route. At their core, route paths are just strings, but can be defined using a variety of syntaxes, each with different behaviors:

- Index Paths
  - `/`
- Static Paths
  - `about`
- Dynamic Paths
  - `$postId`
- Wildcard Paths
  - `*`

## Leading and Trailing Slashes

To make things extremely simple, route paths ignore leading and trailing slashes. You can include them if you want, but they do nothing 😜. The following are all valid paths:

- `/`
- `/about`
- `about/`
- `about`
- `*`
- `/*`
- `/*/`

## Inner Path Slashes

When slashes are used inside of a single path, they can be used to target paths without creating additional component hierarchy or markup.

- `blog/post/edit`
  - This path would only render a single component despite having multiple slashes, e.g.
- `about/me/you`

## Case-Sensitivity

Route paths are **not case-sensitive** by default. This means that `/about` and `/AbOuT` are considered the same path out-of-the box. This is a good thing, since this is the way most of the web works anyway! That said, if you truly want to be weird and match a path with a different case, you can set a route's `caseSensitive` property to `true`.

## Index Routes

A route with a path of `/` is called an "index" route because it specifically targets the index route for its parent and is used to render content for a parent route when no child path is present. For example:

```tsx
let rootRoute = new RootRoute()

// This is the index route for the entire router
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })

const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })

// This is the index route for the `/blog` route
const blogIndexRoute = new Route({ getParentRoute: () => blogRoute, path: '/' })

const routeConfig = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([blogIndexRoute]),
])
```

## Wildcard Routes

A route with a path of `*` is called a "wildcard" route because it eagerly captures _any_ remaining section of the URL from its parent down. For example:

```tsx
let rootRoute = new RootRoute()

// This is the index route for the entire router
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })

const fileBaseRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'file/$',
})

// This is the wildcard route for the `/blog` route
const fileRoute = new Route({
  getParentRoute: () => fileBaseRoute,
  path: '*',
})

const routeConfig = rootRoute.addChildren([
  indexRoute,
  fileBaseRoute.addChildren([fileRoute]),
])
```

## Normal Routes

If you put a component in a normal (non-index) route, it will always render when its route matches, rendering child matches in its `<Outlet />`.

## Layout Routes

A layout route is a route that does not have a path, but allows wrapping it's child routes with wrapper elements or shared logic. See [Layout Routes](./layout-routes) for more information.

```

```
