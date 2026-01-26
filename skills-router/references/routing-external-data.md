---
name: External data loading
description: Integrate data libraries with Router loaders.
version: 1
source: docs/router/framework/react/guide/external-data-loading.md
---

# External data loading

## Summary

- Use loaders to prefetch/ensure critical data for SEO and UX.
- Works with TanStack Query or other promise-based libraries.
- Dehydrate/hydrate on server/client for seamless handoff.

## Use cases

- Prefetch data with TanStack Query in loaders
- Avoid waterfalls and flash of loading content
- Support SSR with data hydration

## Notes

- Use loader to ensure critical data is ready for render.
- Dehydration/hydration is required for SSR handoff.

## Examples

```tsx
export const Route = createFileRoute('/posts')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(postsQueryOptions)
  },
  component: PostsPage,
})
```
