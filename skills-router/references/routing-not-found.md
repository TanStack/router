---
name: Not found handling
description: Missing routes and resource not found errors.
version: 1
source: docs/router/framework/react/guide/not-found-errors.md
---

# Not found handling

## Summary

- Use `notFound()` to signal missing resources in loaders.
- Configure per-route `notFoundComponent` or router defaults.
- `notFoundMode` controls fuzzy vs root handling.

## Use cases

- Signal missing data from loaders
- Render route-specific 404 UI
- Control not-found scope (nearest parent or root)

## Notes

- `notFound()` can target a specific route or the root.
- `CatchNotFound` can be used for component-level handling.

## Examples

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await getPost(params.postId)
    if (!post) throw notFound()
    return post
  },
  component: PostPage,
})
```
