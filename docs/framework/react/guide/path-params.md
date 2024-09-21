---
title: Path Params
---

Path params are used to match a single segment (the text until the next `/`) and provide its value back to you as a **named** variable. They are defined by using the `$` character prefix in the path, followed by the key variable to assign it to. The following are valid path param paths:

- `$postId`
- `$name`
- `$teamId`
- `about/$name`
- `team/$teamId`
- `blog/$postId`

Because path param routes only match to the next `/`, child routes can be created to continue expressing hierarchy:

Let's create a post route file that uses a path param to match the post ID:

- `posts.$postId.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)
  },
})
```

## Path Params can be used by child routes

Once a path param has been parsed, it is available to all child routes. This means that if we define a child route to our `postRoute`, we can use the `postId` variable from the URL in the child route's path!

## Path Params in Loaders

Path params are passed to the loader as a `params` object. The keys of this object are the names of the path params, and the values are the values that were parsed out of the actual URL path. For example, if we were to visit the `/blog/123` URL, the `params` object would be `{ postId: '123' }`:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)
  },
})
```

The `params` object is also passed to the `beforeLoad` option:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  beforeLoad: async ({ params }) => {
    // do something with params.postId
  },
})
```

## Path Params in Components

If we add a component to our `postRoute`, we can access the `postId` variable from the URL by using the route's `useParams` hook:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()
  return <div>Post {postId}</div>
}
```

> 🧠 Quick tip: If your component is code-split, you can use the [getRouteApi function](./code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `Route` configuration to get access to the typed `useParams()` hook.

## Path Params outside of Routes

You can also use the globally exported `useParams` hook to access any parsed path params from any component in your app. You'll need to pass the `strict: false` option to `useParams`, denoting that you want to access the params from an ambiguous location:

```tsx
function PostComponent() {
  const { postId } = useParams({ strict: false })
  return <div>Post {postId}</div>
}
```

## Navigating with Path Params

When navigating to a route with path params, TypeScript will require you to pass the params either as an object or as a function that returns an object of params.

Let's see what an object style looks like:

```tsx
function Component() {
  return (
    <Link to="/blog/$postId" params={{ postId: '123' }}>
      Post 123
    </Link>
  )
}
```

And here's what a function style looks like:

```tsx
function Component() {
  return (
    <Link to="/blog/$postId" params={(prev) => ({ ...prev, postId: '123' })}>
      Post 123
    </Link>
  )
}
```

Notice that the function style is useful when you need to persist params that are already in the URL for other routes. This is because the function style will receive the current params as an argument, allowing you to modify them as needed and return the final params object.
