---
name: Static prerendering
description: Prerender configuration and link crawling.
version: 1
source: docs/start/framework/react/guide/static-prerendering.md
---

# Static prerendering

## Summary

- Enable via `tanstackStart({ prerender: { enabled: true } })`.
- Configure crawl behavior, retries, and filtering.
- Explicit `pages` can be provided when needed.

## Use cases

- Pre-generate marketing pages
- Crawl links to discover static routes
- Configure retries for flaky pages

## Notes

- Dynamic params are excluded from auto-discovery.
- `filter` can limit the crawl scope.

## Examples

```ts
tanstackStart({
  prerender: {
    enabled: true,
    crawlLinks: true,
  },
})
```
