---
name: ISR and caching
description: Incremental static regeneration and CDN cache control.
version: 1
source: docs/start/framework/react/guide/isr.md
---

# ISR and caching

## Summary

- ISR is driven by cache headers (`Cache-Control`, `s-maxage`, `stale-while-revalidate`).
- Use the TanStack Start plugin to prerender routes.
- On-demand revalidation is done via server routes and CDN purge APIs.

## Notes

- Combine CDN caching with Router client cache (`staleTime`, `gcTime`).
- Prefer conservative TTLs and validate with response headers.

## Use cases

- Cache marketing pages at the CDN
- Revalidate on demand after content changes
- Combine CDN caching with client cache

## Notes

- Use `Cache-Control` headers to enable ISR.
- Revalidation requires CDN purge or custom endpoints.

## Examples

```ts
export const Route = createFileRoute('/blog/$slug')({
  headers: () => ({
    'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
  }),
})
```
