---
name: Router + Query integration
description: SSR-aware integration between TanStack Router and TanStack Query.
version: 1
source: docs/router/integrations/query.md
---

# Router + Query integration

## Summary

- Use `@tanstack/react-router-ssr-query` for SSR integration.
- Create a `QueryClient` per request and pass it to the integration.
- `useSuspenseQuery` runs on the server and streams; `useQuery` runs client-only.

## Key behaviors

- `setupRouterSsrQueryIntegration` wires Router to Query.
- `ensureQueryData` or `fetchQuery` can prefetch; awaiting blocks SSR, not awaiting streams.
- Redirects from queries can be handled automatically (configurable).

## Use cases

- Stream queries during SSR
- Share QueryClient across router and components
- Prefetch critical data in loaders

## Notes

- Create a new `QueryClient` per request in SSR.
- Awaiting `ensureQueryData` blocks SSR; not awaiting allows streaming.

## Examples

```ts
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

setupRouterSsrQueryIntegration({
  router,
  queryClient,
})
```
