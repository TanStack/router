---
title: Route Trees & Nesting
---

Like most other routers, TanStack Router uses a nested route tree to match up the URL with the correct component tree to render.

To build a route tree, TanStack Router supports both:

- File-Based Routing
- Code-Based Routing

Both methods support the exact same core features and functionality, but **file-based routing requires less code for the same or better results**. For this reasons, **file-based routing is the preferred and recommended way to configure TanStack Router and most of the documentation is written from the perspective of file-based routing**

For code-based routing documentation, please see
the [Code-Based Routing](./code-based-routing.md) guide.

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

- [Flat Routes](./route-trees.md#flat-routes)
- [Directory Routes](./route-trees.md#directory-routes)
- [Mixed Flat and Directory Routes](./route-trees.md#mixed-flat-and-directory-routes)
- [Code-Based Routes](./route-trees.md#code-based-routes)
- [Case-Sensitivity](./route-trees.md#case-sensitivity)

The route tree examples below showcase the [Routing Concepts](./routing-concepts.md) that are available in TanStack Router.

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

## Mixed Flat and Directory Routes

Both flat and directory routes can be mixed together to create a route tree that uses the best of both worlds where it makes sense.

## Code-Based Routes

Code-based routes are routes that are configured using the `RootRoute` and `Route` classes directly. You may want to do this simply for taste, or you may find a use-case where file-based routing doesn't work for you (if you do, please let us know!). For code-based routing documentation, please see the [Code-Based Routing](./code-based-routing.md) guide.

## Case-Sensitivity

Route paths are **not case-sensitive** _by default_. This means that `about.tsx` and `AbOuT.tsx` are considered the same path out-of-the box. This is a good thing, since this is the way most of the web works anyway! That said, if you truly want to be weird and match a path with a different case, you can set a route's `caseSensitive` option to `true`.
