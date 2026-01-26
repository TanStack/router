---
name: Selective SSR
description: Per-route SSR modes and defaults.
version: 1
source: docs/start/framework/react/guide/selective-ssr.md
---

# Selective SSR

## Summary

- `ssr: true` (default), `ssr: false`, or `ssr: 'data-only'` per route.
- `defaultSsr` sets the default for all routes.
- Child routes can only become more restrictive.

## Use cases

- Disable SSR for client-only pages
- Run loaders on server without rendering HTML
- Set app-wide SSR defaults

## Notes

- `ssr: 'data-only'` runs loaders but skips render.
- Use `defaultSsr` for global defaults.

## Examples

```ts
export const Route = createFileRoute('/map')({
  ssr: false,
  component: MapPage,
})
```
