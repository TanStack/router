---
name: Document head management
description: Head APIs for titles, meta, links, and scripts.
version: 1
source: docs/router/framework/react/guide/document-head-management.md
---

# Document head management

## Summary

- Use `routeOptions.head()` to define title/meta/link/script.
- `HeadContent` renders head output; `Scripts` renders script output.
- Head entries are deduped with deeper routes taking priority.

## Use cases

- Set per-route titles and meta tags
- Add canonical links and structured data
- Inject route-specific scripts

## Notes

- `HeadContent` must be rendered in the document head.
- `Scripts` must be rendered in the body.

## Examples

```tsx
export const Route = createFileRoute('/product/$id')({
  head: ({ params }) => ({
    title: `Product ${params.id}`,
    meta: [{ name: 'description', content: 'Product details' }],
  }),
  component: ProductPage,
})
```
