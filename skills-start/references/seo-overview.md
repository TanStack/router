---
name: SEO and metadata
description: SSR, head management, prerendering, and sitemaps.
version: 1
source: docs/start/framework/react/guide/seo.md
---

# SEO and metadata

## Summary

- Use route `head()` to set meta tags, links, and scripts.
- SSR is on by default; `ssr: false` disables for specific routes.
- Prerender and sitemap generation are supported via the Start plugin.

## Notes

- Sitemaps can be generated via config or served via server routes.
- Robots.txt can be static or dynamic.

## Use cases

- Set per-route meta tags and structured data
- Generate sitemaps
- Enable SSR or prerendering for SEO

## Notes

- Use `head()` to define title/meta/link/script.
- `ssr: false` disables server rendering for a route.

## Examples

```tsx
export const Route = createFileRoute('/docs')({
  head: () => ({
    title: 'Docs',
    meta: [{ name: 'description', content: 'Documentation' }],
  }),
})
```
