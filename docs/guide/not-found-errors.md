---
title: Not Found Errors
---

> ⚠️ This page covers the newer `notFound` function and `notFoundComponent` API for handling not found errors. The `NotFoundRoute` route is deprecated and will be removed in a future release. See [Migrating from `NotFoundRoute`](#migrating-from-notfoundroute) for more information.

Not-found errors are a special class of errors that may be thrown in loader methods and components to signal that a resource cannot be found. TanStack Router has a special API for handling these errors, similar to Next.js' own not-found API.

Beyond being able to display a not-found, TanStack Router also lets you specify where a not-found error gets handled. This allows you to handle not-found errors in a way that preserves layouts.

## `notFound` and `notFoundComponent`

The `notFound` function works in a similar fashion to the `redirect` function. To cause a not-found error, you can **throw a `notFound()`**.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    // Returns `null` if the post doesn't exist
    const post = await getPost(postId)
    if (!post) {
      throw notFound()
      // Alternatively, you can make the notFound function throw:
      // notFound({ throw: true })
    }
    // Post is guaranteed to be defined here because we threw an error
    return { post }
  },
})
```

To handle a not-found error, attach a `notFoundComponent` to the route or **any parent route**.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    // -- see above --
  },
  notFoundComponent: () => {
    return <p>Post not found!</p>
  },
})
```

**If the route you are throwing a not-found error doesn't have a `notFoundComponent` to handle the error,** TanStack Router will check the parent routes of the route where the error was thrown and find a route that defines a `notFoundComponent`. If no routes are able to handle the error, the root route will handle it with a default component.

### Specifying Which Routes Handle Not Found Errors

With just calling the `notFound` function, TanStack Router will try resolving a `notFoundComponent` starting from the route which threw it. If you need to trigger a not-found on a specific parent route, you can import the parent route and call `Route.notFound`:

```tsx
// _layout.tsx
export const Route = createFileRoute('/_layout')({
  // This will render
  notFoundComponent: () => {
    return <p>Not found (in _layout)</p>
  },
  component: () => {
    return (
      <div>
        <p>This is a layout!</p>
        <Outlet />
      </div>
    )
  },
})

// _layout/a.tsx
import { Route as LayoutRoute } from '../_layout'

export const Route = createFileRoute('/_layout/a')({
  loader: async () => {
    // This will make LayoutRoute handle the not-found error
    throw LayoutRoute.notFound()
  },
  // This WILL NOT render
  notFoundComponent: () => {
    return <p>Not found (in _layout/a)</p>
  },
})
```

### "Global" Not Found Errors

"Global" not-found errors are not-founds on the root route. These errors occur when TanStack Router can't match a route for a given path or when a route throws a not-found error that is marked as `global: true` in its options. To handle these errors, attach a `notFoundComponent` to the root route.

### Throwing Not Found Errors in Components

You can also throw not-found errors in components. However, **it is recommended to throw not-found errors in loader methods instead of components in order to correctly type loader data and prevent flickering.**

TanStack Router exposes a `CatchNotFound` component similar to `CatchBoundary` that can be used to catch not-found errors in components and display UI accordingly.

### Data Loading Inside `notFoundComponent`

`notFoundComponent` is a special case when it comes to data loading. **`SomeRoute.useLoaderData` may not be defined depending on which route you are trying to access and where the not-found error gets thrown**. However, `Route.useParams`, `Route.useSearch`, `Route.useRouteContext`, etc. will return a defined value.

**If you need to pass incomplete loader data to `notFoundComponent`,** pass the data via the `data` option in the `notFound` function and validate it in `notFoundComponent`.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    const post = await getPost(postId)
    if (!post)
      throw notFound({
        // Forward some data to the notFoundComponent
        // data: someIncompleteLoaderData
      })
    return { post }
  },
  // `data: unknown` is passed to the component via the `data` option when calling `notFound`
  notFoundComponent: ({ data }) => {
    // ❌ useLoaderData is not valid here: const { post } = Route.useLoaderData()

    // ✅:
    const { postId } = Route.useParams()
    const search = Route.useSearch()
    const context = Route.useRouteContext()

    return <p>Post with id {postId} not found!</p>
  },
})
```

## Usage With SSR

See [SSR guide](./guide/ssr.md) for more information.

## Migrating from `NotFoundRoute`

The `NotFoundRoute` API is deprecated in favor of `notFoundComponent`. The `NotFoundRoute` API will be removed in a future release.

**The `notFound` function and `notFoundComponent` will not work when using `NotFoundRoute`.**

The main differences are:

- `NotFoundRoute` is a route that requires an `<Outlet>` on its parent route to render. `notFoundComponent` is a component that can be attached to any route.
- When using `NotFoundRoute`, you can't use layouts. `notFoundComponent` can be used with layouts.
- When using `notFoundComponent`, path matching is strict. This means that if you have a route at `/post/$postId`, a not-found error will be thrown if you try to access `/post/1/2/3`. With `NotFoundRoute`, `/post/1/2/3` would match the `NotFoundRoute` and only render it if there is an `<Outlet>`.

To migrate from `NotFoundRoute` to `notFoundComponent`, follow these steps:

- Replace `NotFoundRoute` with `notFoundComponent`s on the routes that need to handle not-found errors. For "global" not-found errors, attach a `notFoundComponent` to the root route.
- Remove `<Outlet>`s from the routes that used `NotFoundRoute`.
