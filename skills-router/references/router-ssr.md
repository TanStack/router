---
name: Server-side rendering
description: SSR and streaming rendering options.
version: 1
source: docs/router/framework/react/guide/ssr.md
---

# Server-side rendering

## Summary

- Supports non-streaming and streaming SSR.
- Server uses request handlers and server render helpers.
- Loader data is dehydrated/hydrated automatically.

## Use cases

- Render initial HTML on the server
- Stream deferred data for faster TTFB
- Improve SEO and perceived performance

## Notes

- Server uses memory history by default.
- Streaming works with deferred loader data.

## Examples

```ts
import { createRequestHandler } from '@tanstack/react-router-server'

export const handler = createRequestHandler({
  router,
})
```
