---
title: Route Paths
---

Route `path`s are used to match parts of a URL's pathname to a route. At their core, route paths are just strings and can be defined using a variety of syntaxes, each with different behaviors. Before we get into those behaviors, lets look at a few important cross-cutting path concerns.

### Leading and Trailing Slashes

To make things extremely simple, route paths ignore leading and trailing slashes. You can include them if you want, but they do nothing 😜. The following are all valid paths:

- `/`
- `/about`
- `about/`
- `about`
- `$`
- `/$`
- `/$/`

### Inner Path Slashes

Inner path slashes are 100% valid and can be used to target paths without creating additional component hierarchy or markup.

For example, a path of `blog/post/edit` could be used to render a blog post editor without nesting it inside of other components:

```tsx
const rootConfig = new RootRoute()
const editRoute = new Route({ path: `blog/post/edit`, component: PostEditor })

const routeConfig = rootRoute.addChildren([editRoute])
```

This router setup would only render a single `<PostEditor />` component for the `blog/post/edit` path.

### Case-Sensitivity

Route paths are **not case-sensitive** by default. This means that `/about` and `/AbOuT` are considered the same path out-of-the box. This is a good thing, since this is the way most of the web works anyway! That said, if you truly want to be weird and match a path with a different case, you can set a route's `caseSensitive` property to `true`.

## Index Paths

A route with a path of `/` is called an "index" path because it specifically targets the state of a parent route when no child route is matched. This is best understood through an example:

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

// ✅ This route will match any path that starts with `/about`
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

const routeConfig = rootRoute.addChildren([userBaseRoute])
```

Dynamic segments can be accessed via the `params` object using the label you provided as the property key. For example, a path of `/users/$userId` would produce a `userId` param of `123` for the path `/users/123/details`:

```tsx
{
  userId: '123'
}
```

## Splat Matching

A route with a path of only `*` or `$` is called a "splat" route because it captures _any_ remaining section of the URL from the `*`/`$` down. For example:

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

## Pathless Layout Routes

Pathless layout routes are routes that do not have a `path` and instead an `id` to uniquely identify them. Pathless layout routes do not use path segments from the URL pathname, nor do they add path segments to it during linking. They can be used to:

- Wrap child routes with a layout component
- Enforce an `onLoad` requirement before displaying any child routes
- Validate and provide search params to child routes
- Provide fallbacks for error components or pending elements to child routes
- Provide shared context to all child routes

To create a layout route, define a route with an `id` property instead of a `path`:

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

In the above example, the `layout` route will not add or match any path in the URL, but will wrap the `layout-a` and `layout-b` routes with any elements or logic defined in it.

> 🧠 An ID is required because every route must be uniquely identifiable, especially when using TypeScript so as to avoid type errors and accomplish autocomplete effectively.

Route paths are just the beginning of what you can do with route configuration. We'll explore more of those features later on.
