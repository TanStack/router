---
title: Route Paths
---

Route `path`s are used to match parts of a URL's pathname to a route. At their core, route paths are just strings and can be defined using a variety of syntaxes, each with different behaviors. Before we get into those behaviors, let's look at a few important cross-cutting path concerns.

### Leading and Trailing Slashes

To make things extremely simple, route paths ignore leading and trailing slashes. You can include them if you want, but they will be stripped internally by TanStack Router. The following are all valid paths:

- `/`
- `/about`
- `about/`
- `about`
- `$`
- `/$`
- `/$/`

### Inner Path Slashes

Inner path slashes like `post/edit` are 100% valid and can be used to target specific and deep paths without creating additional routes, component hierarchy or markup.

For example, a path of `post/edit` could be used to render a blog post editor without nesting it inside of other components:

```tsx
const rootConfig = new RootRoute()
const postRoute = new Route({
  getParentRoute: () => rootRoute,
  path: `post`,
  component: Post,
})
const editRoute = new Route({
  getParentRoute: () => rootRoute,
  path: `post/edit`,
  component: PostEditor,
})

const routeConfig = rootRoute.addChildren([editRoute])
```

This router would only render the `<PostEditor />` component when the `post/edit` path is matched.

### Case-Sensitivity

Route paths are **not case-sensitive** by default. This means that `/about` and `/AbOuT` are considered the same path out-of-the box. This is a good thing, since this is the way most of the web works anyway! That said, if you truly want to be weird and match a path with a different case, you can set a route's `caseSensitive` property to `true`.

## Index Paths

A route with a path of `/` is called an "index" path because it specifically targets the state of a parent route when no child route is matched. This is best understood through an example. Let's build the following route tree structure:

- `/` - Index Route
- `/blog` - Blog Route
  - `/` - Blog Index Route
  - `/$slug` - Blog Post Route

```tsx
let rootRoute = new RootRoute()

// ✅ This is the index route for the entire router
// It will only display when the path is `/`
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })

const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })

// ✅ This is the index route for the `/blog` route
// It will only display when the path is `/blog`
const blogIndexRoute = new Route({ getParentRoute: () => blogRoute, path: '/' })

const routeConfig = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([blogIndexRoute]),
])
```

If a route has any children, it is uncommon not to also have an index route. This is because the index route is the only way to render a component when the parent route is matched, but no child route is matched.

## Static Paths

Static paths are the simplest type of route path. They are just a string that matches the beginning of a URL's pathname. For example:

```tsx
let rootRoute = new RootRoute()

// ✅ This route will match any path that starts with the `/about` segment
const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'about',
})

const routeConfig = rootRoute.addChildren([aboutRoute])
```

## Dynamic Segments

A route path segment that starts with a `$` followed by a label is called a "dynamic segment" and captures that section of the URL into the `params` object for use in your application. For example:

```tsx
let rootRoute = new RootRoute()

const usersRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'users',
})

// ✅ This path will capture anything in the path after `/users` and before the next slash
// eg. `/users/123` and `/users/123/details will both capture `123`
const userRoute = new Route({
  getParentRoute: () => usersRoute,
  path: '$userId',
})

const routeConfig = rootRoute.addChildren([usersRoute.addChildren([userRoute])])
```

Dynamic segments can be accessed via the `params` object in many places throughout the router using the label you provided as the property key. For example, a path of `/users/$userId` would produce a `userId` param of `123` for the path `/users/123/details`:

```tsx
{
  userId: '123'
}
```

## Splat / Catch-All Matching

A route with a path of only `*` or `$` is called a "splat" route because it _always_ captures _any_ remaining section of the URL from the `*`/`$` down. For example:

```tsx
let rootRoute = new RootRoute()

// This route will match any path that starts with `/file`
// For example, it will match both `/file` and `/file/documents/hello-world
const fileBaseRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'file/*', // or `file/$`
})

const routeConfig = rootRoute.addChildren([fileBaseRoute])
```

Splat routes capture their matched path in the `params` object under the `*` property. For example, if the path is `/file/documents/hello-world`, the `params` object would look like this:

```js
{
  '*': 'documents/hello-world'
}
```

> 🧠 Why use both `*` and `$`? Thanks to tools like Remix, we know that while `*`s are the most common character to represent a wildcard/splat, they do not play nice with filenames or CLI tools. In those cases `$` can be a better choice.

## Pathless Routes

Pathless routes are routes that do not have a `path` and instead an `id` to uniquely identify them. Pathless routes do not use path segments from the URL pathname, nor do they add path segments to it during linking. They can be used to:

- Wrap child routes with a layout component
- Enforce an `loader` requirement before displaying any child routes
- Validate and provide search params to child routes
- Provide fallbacks for error components or pending elements to child routes
- Provide shared context to all child routes

To create a pathless route, define a route with an `id` property instead of a `path`:

```tsx
const rootRoute = new Route()

// Our layout route
const layoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'layout',
})

const layoutARoute = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
})

const layoutBRoute = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
})

const routeConfig = rootRoute.addChildren([
  layoutRoute.addChildren([layoutARoute, layoutBRoute]),
])
```

In the above example, the pathless route will not add or match any path in the URL, but will wrap the `layout-a` and `layout-b` routes with any elements or logic defined in it.

> 🧠 An ID is required because every route must be uniquely identifiable, especially when using TypeScript so as to avoid type errors and accomplish autocomplete effectively.

## 404 / `NotFoundRoute`s

404 / non-matching routes are technically feasible by placing a [Splat / Catch-All](#splat-catch-all-matching) route under the root or another parent route. However, if you have a lot of route branches, this can be a bit cumbersome. Instead, you can create a `NotFoundRoute` and provide it to your router's `notFoundRoute` option.

> ⚠️ Never include a `NotFoundRoute` in your route tree. Doing so will not allow it to work at every branch of your route tree.

`NotFoundRoutes` are rendered when:

- excess path segments are found in the URL beyond all possible route matches
- there is no dynamic segment or splat route to capture the excess path segments
- there is no index route to render when the parent route is matched
- a `notFoundRoute` is provided to the router

`NotFoundRoute`s are special versions of a `Route` that:

- Have no `path`
- Have no `id`
- Cannot parse or validate path params

They do however still have the ability to:

- Render `component`, `pendingComponent` and `errorComponent`s
- Validate and receive `search` params
- Configure `loader`s and `beforeLoad` hooks
- Receive `data` and search params from the root route

```tsx
const routeTree = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([blogIndexRoute]),
])

const notFoundRoute = new Route({
  component: NotFound,
})

const router = new Router({
  routeTree,
  notFoundRoute,
})
```

## Identifying Routes via Search Params

Search Params by default are not used to identify matching paths mostly because they are extremely flexible, flat and can contain a lot of unrelated data to your actual route definition. However, in some cases you may need to use them to uniquely identify a route match. For example, you may have a route that uses a search param to "key" the markup that is rendered for a route. Imagine a `/users/user` route that uses the search param `userId` to identify a specific user in your application, you might model your url like this: `/users/user?userId=123`. This means that your `user` route would need some extra help to identify a specific user. You can do this by adding a `key` function to your route:

```tsx
const userRoute = new Route({
  getParentRoute: () => usersRoute,
  path: 'user',
  key: ({ search }) => [search.userId],
})
```

---

These are just the basics of configuring route paths and structure for your route tree and is just the beginning of what you can do with the rest of the available route configuration options. We'll explore more of those features later on.
