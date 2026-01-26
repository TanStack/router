---
name: Data loading
description: Loader lifecycle, caching, and pending behavior.
version: 1
source: docs/router/framework/react/guide/data-loading.md
---

# Data loading

## Summary

- Loaders run after route matching and before render.
- Use `loaderDeps` and `validateSearch` to manage cache keys.
- Control cache with `staleTime`, `gcTime`, and `shouldReload`.

## Lifecycle

- `beforeLoad` runs first, then `loader`.
- Pending UI uses `pendingMs` and `pendingMinMs`.
- Errors flow to route `errorComponent` or defaults.

## Use cases

- Fetch data before route render
- Coordinate cache invalidation with navigation
- Show pending UI for slow loads

## Notes

- `loaderDeps` influences caching and revalidation.
- `pendingMs` and `pendingMinMs` control loading UI timing.

## Examples

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)
  },
  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()
  return <h1>{post.title}</h1>
}
```
