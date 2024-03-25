---
title: Route Trees & Nesting
---

Like most other routers, TanStack Router uses a nested route tree to match up the URL with the correct component tree to render.

To build a route tree, TanStack Router supports both:

- File-Based Routing
- Code-Based Routing

Both methods support the exact same core features and functionality, but **file-based routing requires less code for the same or better results**. For this reasons, **file-based routing is the preferred and recommended way to configure TanStack Router and most of the documentation is written from the perspective of file-based routing**

For code-based routing documentation, please see
the [Code-Based Routing](./guide/code-based-routing) guide.

## Route Trees

Nested routing is a powerful concept that allows you to use a URL to render a nested component tree. For example, given the URL of `/blog/posts/123`, you could match a path hierarchy that looks like this:

- /blog
  - /posts
    - /$postId

And render a component tree that looks like this:

```tsx
<Blog>
  <Posts>
    <Post postId="123" />
  </Posts>
</Blog>
```

To configure nested routing TanStack Router uses a route hierarchy called a **route tree** to organize, match and compose matching routes into a component tree.

Consider the following route tree:

- _Root_
  - `/`
  - `about`
  - `posts`
    - `/`
    - `$postId`
  - `posts/$postId/edit`
  - `settings`
    - `profile`
    - `notifications`
  - `layout`
    - `layout-a`
    - `layout-b`
  - `files`
    - `$`
- _Not-Found Route_

Route trees are represented using a number of different ways:

- [Flat Routes](./guide/route-trees#flat-routes)
- [Directory Routes](./guide/route-trees#directory-routes)
- [Mixed Flat and Directory Routes](./guide/route-trees#mixed-flat-and-directory-routes)
- [Code-Based Routes](./guide/route-trees#code-based-routes)
- [Case-Sensitivity](./guide/route-trees#case-sensitivity)

## Flat Routes

Flat routing uses same level of nesting. They make it easy to see and find routes in your project:

| Filename                     | Route Path                | Component Output                  |
| ---------------------------- | ------------------------- | --------------------------------- |
| `__root.tsx`                 |                           | `<Root>`                          |
| `index.tsx`                  | `/` (exact)               | `<Root><RootIndex>`               |
| `about.tsx`                  | `/about`                  | `<Root><About>`                   |
| `posts.tsx`                  | `/posts`                  | `<Root><Posts>`                   |
| `posts.index.tsx`            | `/posts` (exact)          | `<Root><Posts><PostsIndex>`       |
| `posts.$postId.tsx`          | `/posts/$postId`          | `<Root><Posts><Post>`             |
| `posts_.$postId.edit.tsx`    | `/posts/$postId/edit`     | `<Root><EditPost>`                |
| `settings.tsx`               | `/settings`               | `<Root><Settings>`                |
| `settings.profile.tsx`       | `/settings/profile`       | `<Root><Settings><Profile>`       |
| `settings.notifications.tsx` | `/settings/notifications` | `<Root><Settings><Notifications>` |
| `_layout.tsx`                |                           | `<Root><Layout>`                  |
| `_layout.layout-a.tsx`       | `/layout-a`               | `<Root><Layout><LayoutA>`         |
| `_layout.layout-b.tsx`       | `/layout-b`               | `<Root><Layout><LayoutB>`         |
| `files.$.tsx`                | `/files/$`                | `<Root><Files>`                   |
| `__404.tsx`                  | (Not Found)               | `<Root><NotFound>`                |

## Directory Routes

Directory routes are routes that are nested within a directory, which can be useful for organizing routes into logical groups and also cutting down on the filename length for routes that get deeply nested:

| Filename              | Route Path                | Component Output                  |
| --------------------- | ------------------------- | --------------------------------- |
| `__root.tsx`          |                           | `<Root>`                          |
| `index.tsx`           | `/` (exact)               | `<Root><RootIndex>`               |
| `about.tsx`           | `/about`                  | `<Root><About>`                   |
| `posts.tsx`           | `/posts`                  | `<Root><Posts>`                   |
| `posts` (dir)         |                           |                                   |
| - `index.tsx`         | `/posts` (exact)          | `<Root><Posts><PostsIndex>`       |
| - `$postId.tsx`       | `/posts/$postId`          | `<Root><Posts><Post>`             |
| `posts_` (dir)        |                           |                                   |
| - `$postId` (dir)     |                           |                                   |
| - - `edit.tsx`        | `/posts/$postId/edit`     | `<Root><EditPost>`                |
| `settings.tsx`        | `/settings`               | `<Root><Settings>`                |
| `settings` (dir)      |                           | `<Root><Settings>`                |
| - `profile.tsx`       | `/settings/profile`       | `<Root><Settings><Profile>`       |
| - `notifications.tsx` | `/settings/notifications` | `<Root><Settings><Notifications>` |
| `_layout.tsx`         |                           | `<Root><Layout>`                  |
| `_layout` (dir)       |                           |                                   |
| - `layout-a.tsx`      | `/layout-a`               | `<Root><Layout><LayoutA>`         |
| - `layout-b.tsx`      | `/layout-b`               | `<Root><Layout><LayoutB>`         |
| `files` (dir)         |                           |                                   |
| - `$.tsx`             | `/files/$`                | `<Root><Files>`                   |
| `__404.tsx`           | (Not Found)               | `<Root><NotFound>`                |

## Mixed Flat and Directory Routes

Both flat and directory routes can be mixed together to create a route tree that uses the best of both worlds where it makes sense.

## Code-Based Routes

Code-based routes are routes that are configured using the `RootRoute` and `Route` classes directly. You may want to do this simply for taste, or you may find a use-case where file-based routing doesn't work for you (if you do, please let us know!). For code-based routing documentation, please see the [Code-Based Routing](./guide/code-based-routing) guide.

## Case-Sensitivity

Route paths by default are **not case-sensitive** by default. This means that `about.tsx` and `AbOuT.tsx` are considered the same path out-of-the box. This is a good thing, since this is the way most of the web works anyway! That said, if you truly want to be weird and match a path with a different case, you can set a route's `caseSensitive` option to `true`.

## Routing Concepts

Just in these small examples above, we can see just about all of the major available routing concepts at play:

- [The Root Route](./guide/route-trees#the-root-route)
- [Static Routes](./guide/route-trees#static-routes)
- [Index Routes](./guide/route-trees#index-routes)
- [Dynamic Route Segments](./guide/route-trees#dynamic-route-segments)
- [Splat / Catch-All Routes](./guide/route-trees#splat--catch-all-routes)
- [Pathless / Layout Routes](./guide/route-trees#pathless--layout-routes)
- [Non-Nested Routes](./guide/route-trees#non-nested-routes)
- [Not-Found Routes](./guide/route-trees#404--notfoundroutes)

Each of these concepts is useful and powerful, and we'll dive into each of them in the following sections.

## The Root Route

The root route is the top-most route in the entire tree and encapsulates all other routes as children.

- It has no path
- It is always matched
- Its `component` is always rendered

Even though it doesn't have a path, the root route has access to all of the same functionality as other routes including:

- components
- loaders
- search param validation
- etc.

To create a root route, call the `createRootRoute()` constructor and export it as the `Route` variable in your route file:

```tsx
import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
```

> 🧠 You can also create a root route via the `createRootRouteWithContext<TContext>()` function, which is a type-safe way of doing dependency injection for the entire router. Read more about this in the [Context Section](./guide/router-context) -->

## Anatomy of a Route

All other routes other than the root route are configured using the `FileRoute` class. The `FileRoute` class is a wrapper around the `Route` class that provides type safety when using file-based routing:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: PostsComponent,
})
```

### The `createFileRoute` Path Argument

The `createFileRoute` function takes a single argument, the file-route's path as a string.

**❓❓❓ "Wait, you're making me pass the path of the route file to `createFileRoute`?"**

Yes! But don't worry, this path is **automatically written and managed by the router for you via the Vite plugin or Router CLI.** So, as you create new routes, move routes around or rename routes, the path will be updated for you automatically.

> 🧠 The reason for this pathname has everything to do with the magical type safety of TanStack Router. Without this pathname, TypeScript would have no idea what file we're in! (We wish TypeScript had a built-in for this, but they don't yet 🤷‍♂️)

## Static Routes

Static routes simply match a specific path. In our example route tree above, the `/about`, `/settings`, `/settings/profile` and `/settings/notifications` routes are all static routes.

Let's take a look at the `/about` route:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutComponent,
})

function AboutComponent() {
  return <div>About</div>
}
```

Static routes are simple and straightforward. They match the path exactly and render the provided component.

## Index Routes

Index routes specifically target their parent route when it is matched exactly and no child route is matched. We can see this in the above route tree with both the root index route (`index.tsx`) and the posts index route (`posts.index.tsx`).

Let's take a look at the posts index route (`posts.index.tsx`):

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Please select a post!</div>
}
```

In this example, the `posts.index.tsx` file is nested under the `posts` directory, so it will be matched when the URL is `/posts` exactly. When this happens, the `PostsIndexComponent` will be rendered.

## Dynamic Route Segments

Route path segments that start with a `$` followed by a label are dynamic and capture that section of the URL into the `params` object for use in your application. For example, a pathame of `/posts/123` would match the `/posts/$postId` route, and the `params` object would be `{ postId: '123' }`.

These params are then usable in your route's configuration and components! Let's look at the `posts.$postId.tsx` route from our example route tree above:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  // In a loader
  loader: ({ params }) => fetchPost(params.postId),
  // Or in a component
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()
  return <div>Post ID: {postId}</div>
}
```

> 🧠 Dynamic segments work at **each** segment of the path. For example, you could have a route with the path of `/posts/$postId/$revisionId` and each `$` segment would be captured into the `params` object.

## Splat / Catch-All Routes

A route with a path of only `$` is called a "splat" route because it _always_ captures _any_ remaining section of the URL pathname from the `$` to the end. The captured pathname is then available in the `params` object under the special `_splat` property.

For example, our route tree above has a `files/$` splat route. If the URL pathname is `/files/documents/hello-world`, the `params` object would contain `documents/hello-world` under the special `_splat` property:

```js
{
  '_splat': 'documents/hello-world'
}
```

> ⚠️ In v1 of the router, splat routes are also denoted with a `*` instead of a `_splat` key for backwards compatibility. This will be removed in v2.

> 🧠 Why use `$`? Thanks to tools like Remix, we know that despite `*`s being the most common character to represent a wildcard, they do not play nice with filenames or CLI tools, so just like them, we decided to use `$` instead.

## Pathless / Layout Routes

File routes that are prefixed with an underscore (`_`) are considered "pathless" / a "layout". Pathless/Layout routes can be used to wrap child routes with additional components and logic, without requiring a matching `path` in the URL

- Wrap child routes with a layout component
- Enforce a `loader` requirement before displaying any child routes
- Validate and provide search params to child routes
- Provide fallbacks for error components or pending elements to child routes
- Provide shared context to all child routes

> 🧠 The part of the path after the `_` prefix is used as the route's ID and is required because every route must be uniquely identifiable, especially when using TypeScript so as to avoid type errors and accomplish autocomplete effectively.

In our example route tree above, the `_layout` route is a pathless route that wraps the `layout-a` and `layout-b` routes with a layout component. This means that when the URL is `/layout-a`, the `/_layout/layout-a` route will be matched and the component tree will look like this:

```tsx
<Layout>
  <LayoutA />
</Layout>
```

Let's take a look at the `_layout.tsx` route:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout')({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div>
      <h1>Layout</h1>
      <Outlet />
    </div>
  )
}
```

## Non-Nested Routes

Non-nested routes can be created by suffixing a parent file route segment with a `_`. Non-nested routes are valuable because you don't always want a route to be nested, but instead you need it to "break out" of the parent route's path and render its own completely different component tree.

During path matching, the trailing `_` is ignored, so `/posts` and `/posts_` are considered the same path. However, when constructing the component tree, the `_` is used to denote a non-nested route, so `/posts` and `/posts_` are considered different routes.

In our example route tree above, `/posts` and `/posts_/$postId/edit` routes are siblings, not parent/child. To make this easier to understand, here's their section of the route tree and a pseudo-code component representation comparison between `/posts/$postId` and `/posts/$postId/edit`:

- `/posts_/$postId/edit`
- `/posts`
  - `$postId`

```tsx
// `posts_.$postId.edit.tsx`
<EditPost postId={postId} />

// `posts.$postId.tsx`
<Posts>
  <Post postId={postId} />
</Posts>
```

Notice how the post editor route is considered a sibling of the post route, not a child and would get matched by specificity before the post route. Likewise, the post editor component's parent is the root route, not the posts route, so it is not wrapped in the `<Posts>` component.

## 404 / `NotFoundRoute`s

404 / Not-Found routes, while not an explicit part of the route tree, are a useful abstraction on the concept.

Sure, you could technically (and monotonously) place a splat / catch-all route under every route branch you create. But even at a small scale, this is cumbersome and prone to error. Instead, you can create a special `NotFoundRoute` and provide it to your router's `notFoundRoute` option.

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

We'll cover how to configure a `NotFoundRoute` in the [Route Matching - Not-Found Routes](./guide/route-matching#not-found-routes) guide.
