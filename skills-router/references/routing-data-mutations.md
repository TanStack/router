---
name: Data mutations
description: Mutation patterns and route invalidation.
version: 1
source: docs/router/framework/react/guide/data-mutations.md
---

# Data mutations

## Summary

- Router does not store mutation state; use external libs.
- Call `router.invalidate()` to refresh current matches.
- Use `router.invalidate({ sync: true })` to await reload.

## Use cases

- Refresh route data after a mutation
- Ensure stale data is reloaded in the background
- Coordinate cache invalidation with navigation

## Notes

- Router does not manage mutation state directly.
- Use external libraries for optimistic updates and retries.

## Examples

```tsx
const mutation = useMutation({
  mutationFn: updatePost,
  onSuccess: () => router.invalidate(),
})
```
