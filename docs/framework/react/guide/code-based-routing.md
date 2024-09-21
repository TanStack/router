---
title: Code-Based Routing
---

## ⚠️ Before You Start

- If you're using [File-Based Routing](./file-based-routing.md), **skip this guide**.
- If you are new to TanStack Router, please be aware that **file-based routing is the recommended way to configure TanStack Router**. If you're not sure which to use, please read the [File-Based Routing](./file-based-routing.md) guide first.
- If you still insist on using code-based routing, you must read the [File-Based Routing](./file-based-routing.md) guide first as it also covers core concepts of the router that are not repeated here.

## Route Trees

Code-based routing is no different from file-based routing in that it uses the same route tree concept to organize, match and compose matching routes into a component tree. The only difference is that instead of using the filesystem to organize your routes, you use code.

Let's consider the same route tree from the [Route Trees & Nesting](./route-trees.md#route-trees) guide, and convert it to code-based routing:

Here is the file-based version:

```
routes/
├── __root.tsx
├── index.tsx
├── about.tsx
├── posts/
│   ├── index.tsx
│   ├── $postId.tsx
├── posts.$postId.edit.tsx
├── settings/
│   ├── profile.tsx
│   ├── notifications.tsx
├── _layout.tsx
├── _layout/
│   ├── layout-a.tsx
├── ├── layout-b.tsx
├── files/
│   ├── $.tsx
```

And here is a summarized code-based version:

```tsx
import { createRootRoute, createRoute } from '@tanstack/react-router'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
})

const postEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts/$postId/edit',
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings',
})

const profileRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'profile',
})

const notificationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'notifications',
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
})

const layoutARoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
})

const layoutBRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
})

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files/$',
})
```

## File-Based vs Code-Based Routing

Believe it or not, file-based routing is really a superset of code-based routing and uses the filesystem and a bit of code-generation abstraction on top of it to generate this structure you see above automatically.

We're going to assume you've read the [File-Based Routing](./file-based-routing.md) guide and are familiar with each of these main concepts:

- The Root Route
- Static Routes
- Index Routes
- Dynamic Route Segments
- Splat / Catch-All Routes
- Pathless Routes
- Non-Nested Routes
- Not-Found Routes

**Now, let's take a look at how to create each of these route types in code.**

## The Root Route

Creating a root route in code-based routing is thankfully the same as doing so in file-based routing. Call the `createRootRoute()` function.

Unlike file-based routing however, you do not need to export the root route if you don't want to. It's certainly not recommended to build an entire route tree and application in a single file (although you can and we do this in the examples to demonstrate routing concepts in brevity).

```tsx
import { createRootRoute } from '@tanstack/react-router'

const rootRoute = createRootRoute()
```

> 🧠 You can also create a root route via the `createRootRouteWithContext<TContext>()` function, which is a type-safe way of doing dependency injection for the entire router. Read more about this in the [Context Section](./router-context.md) -->

## Anatomy of a Route

All other routes other than the root route are configured using the `createRoute` function:

```tsx
const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: PostsComponent,
})
```

### The `getParentRoute` option

The `getParentRoute` option is a function that returns the parent route of the route you're creating.

**❓❓❓ "Wait, you're making me pass the parent route for every route I make?"**

Absolutely! The reason for passing the parent route has **everything to do with the magical type safety** of TanStack Router. Without the parent route, TypeScript would have no idea what types to supply your route with!

### The `path` option

For every route that **is not the root route or a pathless route**, a `path` option is required. This is the path that will be matched against the URL pathname to determine if the route is a match.

#### Leading/Trailing Slashes

When configuring routes via code, route paths ignore leading and trailing slashes (this does not include "index" route paths `/`). You can include them if you want, but they will be normalized internally by TanStack Router. Here is a table of valid paths and what they will be normalized to:

| Path     | Normalized Path |
| -------- | --------------- |
| `/`      | `/`             |
| `/about` | `about`         |
| `about/` | `about`         |
| `about`  | `about`         |
| `$`      | `$`             |
| `/$`     | `$`             |
| `/$/`    | `$`             |

## Manually building the route tree

When building a route tree in code, it's not enough to define the parent route of each route. You must also construct the final route tree by adding each route to its parent route's `children` array. This is because the route tree is not built automatically for you like it is in file-based routing.

```tsx
/* prettier-ignore */
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postRoute,
  ]),
  postEditorRoute,
  settingsRoute.addChildren([
    profileRoute,
    notificationsRoute,
  ]),
  layoutRoute.addChildren([
    layoutARoute,
    layoutBRoute,
  ]),
  filesRoute.addChildren([
    fileRoute,
  ]),
])
/* prettier-ignore-end */
```

## Static Routes

To create a static route, simply provide a normal `path` string to the `createRoute` function:

```tsx
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
})
```

## Index Routes

Unlike file-based routing, which uses the `index` filename to denote an index route, code-based routing uses a single slash `/` to denote an index route. For example, the `posts.index.tsx` file from our example route tree above would be represented in code-based routing like this:

```tsx
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  // Notice the single slash `/` here
  path: '/',
})
```

## Dynamic Route Segments

Dynamic route segments work exactly the same in code-based routing as they do in file-based routing. Simply prefix a segment of the path with a `$` and it will be captured into the `params` object of the route's `loader` or `component`:

```tsx
const postIdRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  // In a loader
  loader: ({ params }) => fetchPost(params.postId),
  // Or in a component
  component: PostComponent,
})

function PostComponent() {
  const { postId } = postIdRoute.useParams()
  return <div>Post ID: {postId}</div>
}
```

> [!TIP]
> If your component is code-split, you can use the [getRouteApi function](./code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `postIdRoute` configuration to get access to the typed `useParams()` hook.

## Splat / Catch-All Routes

As expected, splat/catch-all routes also work the same in code-based routing as they do in file-based routing. Simply prefix a segment of the path with a `$` and it will be captured into the `params` object under the `_splat` key:

```tsx
const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files',
})

const fileRoute = createRoute({
  getParentRoute: () => filesRoute,
  path: '$',
})
```

For the URL `/documents/hello-world`, the `params` object will look like this:

```js
{
  '_splat': 'documents/hello-world'
}
```

## Pathless Routes

In file-based routing a pathless route is prefixed with a `_`, but in code-based routing, a pathless route is simply a route with an `id` instead of a `path` option. This is because code-based routing does not use the filesystem to organize routes, so there is no need to prefix a route with a `_` to denote that it has no path.

```tsx
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
  component: LayoutComponent,
})

const layoutARoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
})

const layoutBRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
})

const routeTree = rootRoute.addChildren([
  // The layout route has no path, only an id
  // So its children will be nested under the layout route
  layoutRoute.addChildren([layoutARoute, layoutBRoute]),
])
```

Now both `/layout-a` and `/layout-b` will render the their contents inside of the `LayoutComponent`:

```tsx
// URL: /layout-a
<LayoutComponent>
  <LayoutAComponent />
</LayoutComponent>

// URL: /layout-b
<LayoutComponent>
  <LayoutBComponent />
</LayoutComponent>
```

## Non-Nested Routes

Building non-nested routes in code-based routing does not require using a trailing `_` in the path, but does require you to build your route and route tree with the right paths and nesting. Let's consider the route tree where we want the post editor to **not** be nested under the posts route:

- `/posts_/$postId/edit`
- `/posts`
  - `$postId`

To do this we need to build a separate route for the post editor an include the entire path in the `path` option from the root of where we want the route to be nested (in this case, the root):

```tsx
// The posts editor route is nested under the root route
const postEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  // The path includes the entire path we need to match
  path: 'posts/$postId/edit',
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
})

const routeTree = rootRoute.addChildren([
  // The post editor route is nested under the root route
  postEditorRoute,
  postsRoute.addChildren([postRoute]),
])
```

## 404 / `NotFoundRoute`s

We'll cover how to configure a `NotFoundRoute` in the [Not Found Errors](./not-found-errors.md) guide.
