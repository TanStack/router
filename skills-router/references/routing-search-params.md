---
name: Search params
description: Validation, inheritance, and updates for search params.
version: 1
source: docs/router/framework/react/guide/search-params.md
---

# Search params

## Summary

- Use `validateSearch` to parse and type search params safely.
- Search params inherit down the route tree.
- Read with `Route.useSearch`, `useSearch`, or `getRouteApi`.
- Update with `<Link search>` or `navigate({ search })`.

## Key behaviors

- Use schema validators (zod/valibot/arktype/effect) for runtime safety.
- Use fallback/catch to avoid throwing on invalid params.
- Use `search.middlewares`, `retainSearchParams`, and `stripSearchParams` for control.
- `search={true}` preserves all search params when navigating.

## Use cases

- Type-safe filter and sort state in URLs
- Preserve search state across navigation
- Validate and normalize query params

## Notes

- Prefer schema validation to avoid runtime errors.
- Use `retainSearchParams` for cross-route persistence.

## Examples

```tsx
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/search')({
  validateSearch: z.object({
    q: z.string().optional(),
    page: z.coerce.number().default(1),
  }),
  component: SearchPage,
})

function SearchPage() {
  const search = Route.useSearch()
  return <div>Query: {search.q}</div>
}
```

```tsx
<Link to="/search" search={(prev) => ({ ...prev, page: 2 })}>
  Next page
</Link>
```
