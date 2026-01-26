---
name: Deferred data
description: Streaming deferred loader data with Await.
version: 1
source: docs/router/framework/react/guide/deferred-data-loading.md
---

# Deferred data

## Summary

- Loaders can return unresolved promises for deferred data.
- Use `<Await>` (or React 19 `use`) to render deferred values.
- Works with streaming SSR and error boundaries.

## Use cases

- Stream slow data without blocking initial render
- Improve time-to-first-byte in SSR
- Render partial UI while loading

## Notes

- Deferred values suspend the nearest boundary.
- Prefer external data libraries when using their own suspense patterns.

## Examples

```tsx
export const Route = createFileRoute('/dashboard')({
  loader: async () => ({
    stats: fetchStats(),
  }),
  component: Dashboard,
})

function Dashboard() {
  const { stats } = Route.useLoaderData()
  return <Await promise={stats}>{(data) => <StatsView data={data} />}</Await>
}
```
