---
title: Route Trees & Nesting
---

TanStack Router uses a nested route tree to match up the URL with the correct component tree to render.

To build a route tree, TanStack Router supports both:

- File-Based Routing
- Code-Based Routing

Both methods support the exact same core features and functionality, but **file-based routing requires less code for the same or better results**. For this reasons, **file-based routing is the preferred and recommended way to configure TanStack Router and most of the documentation is written from the perspective of file-based routing**

For code-based routing documentation, please see
the [Code-Based Routing](./code-based-routing.md) guide.

## Route Trees

Nested routing is a powerful concept that allows you to use a URL to render a nested component tree. For example, given the URL of `/blog/posts/123`, you could create a route hierarchy that looks like this:

```tsx
├── blog
│   ├── posts
│   │   ├── $postId
```

And render a component tree that looks like this:

```tsx
<Blog>
  <Posts>
    <Post postId="123" />
  </Posts>
</Blog>
```

Let's take that concept and expand it out to a larger site structure, but with file-names now:

```
/routes
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
├── _layout/
│   ├── layout-a.tsx
├── ├── layout-b.tsx
├── files/
│   ├── $.tsx
```

There's a lot of power and convention to unpack with file-based routing, so let's break it down a bit.

## Route Tree Configuration

Route trees can be represented using a number of different ways:

- [Flat Routes](./route-trees.md#flat-routes)
- [Directory Routes](./route-trees.md#directory-routes)
- [Mixed Flat and Directory Routes](./route-trees.md#mixed-flat-and-directory-routes)
- [Code-Based Routes](./route-trees.md#code-based-routes)
- [Case-Sensitivity](./route-trees.md#case-sensitivity)

For a birds-eye view, the route tree examples below showcase the [Routing Concepts](./routing-concepts.md) that are available in TanStack Router, but please be sure to check out the full documentation links above for each type of route tree, or just proceed to the next section to get started with file-based routing.

## Case-Sensitivity

Route paths are **not case-sensitive** _by default_. This means that `about.tsx` and `AbOuT.tsx` are considered the same path out-of-the box. This is a good thing, since this is the way most of the web works anyway! That said, if you truly want to be weird and match a path with a different case, you can set a route's `caseSensitive` option to `true`.
