---
id: query
title: TanStack Query Integration
---

> [!IMPORTANT]
> This integration automates SSR dehydration/hydration and streaming between TanStack Router and TanStack Query. If you haven't read the standard [External Data Loading](../framework/react/guide/external-data-loading.md) guide, start there.

## What you get

- **Automatic SSR dehydration/hydration** of your `QueryClient`
- **Streaming of queries** that resolve during initial server render to the client
- **Redirect handling** for `redirect()` errors thrown from queries/mutations
- Optional **provider wrapping** with `QueryClientProvider`

## Installation

```bash
pnpm add @tanstack/react-query @tanstack/react-router-ssr-query
# or
npm i @tanstack/react-query @tanstack/react-router-ssr-query
```

## Setup

Create your router and wire up the integration. Ensure a fresh `QueryClient` is created per request in SSR environments.

```tsx
// src/router.tsx
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient()
  const router = createRouter({
    routeTree,
    // optionally expose the QueryClient via router context
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    // optional:
    // handleRedirects: true,
    // wrapQueryClient: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

By default, the integration wraps your router with `QueryClientProvider`. If you already provide your own provider, pass `wrapQueryClient: false` and keep your custom wrapper.

## Use in routes

### Preload with a loader and read with a hook

Preload critical data in the route `loader` to avoid waterfalls and loading flashes, then read it in the component. The integration ensures server-fetched data is dehydrated and streamed to the client during SSR.

```tsx
// src/routes/posts.tsx
import { queryOptions, useSuspenseQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

const postsQuery = queryOptions({
  queryKey: ['posts'],
  queryFn: () => fetch('/api/posts').then((r) => r.json()),
})

export const Route = createFileRoute('/posts')({
  // Ensure the data is in the cache before render
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  // Optional SSR modes: true | 'data-only' | false
  ssr: 'data-only',
  component: PostsPage,
})

function PostsPage() {
  // Prefer suspense for best SSR + streaming behavior
  const { data } = useSuspenseQuery(postsQuery)
  return <div>{data.map((p: any) => p.title).join(', ')}</div>
}
```

### Using useSuspenseQuery vs useQuery

- `useSuspenseQuery`: runs on the server during SSR when its data is required and will be streamed to the client as it resolves.
- `useQuery`: does not execute on the server; it will fetch on the client after hydration. Use this for data that is not required for SSR.

```tsx
// Suspense: executes on server and streams
const { data } = useSuspenseQuery(postsQuery)

// Non-suspense: executes only on client
const { data, isLoading } = useQuery(postsQuery)
```

### Prefetch explicitly in the loader

You can also prefetch with `fetchQuery` or `ensureQueryData` and choose whether to await it for the initial render.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { queryOptions, useQuery } from '@tanstack/react-query'

const userQuery = (id: string) =>
  queryOptions({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then((r) => r.json()),
  })

export const Route = createFileRoute('/user/$id')({
  context: ({ params }) => ({ q: userQuery(params.id) }),
  loader: ({ context, params }) => {
    // Option A: await to block SSR until data is ready
    if (params.id === 'sync') return context.queryClient.fetchQuery(context.q)
    // Option B: don't await; query will stream when it resolves
    return undefined
  },
  ssr: 'data-only',
  component: () => {
    const ctx = Route.useRouteContext()
    const { data } = useQuery(ctx.q)
    return <div>{data ? data.name : 'loading...'}</div>
  },
})
```

## Redirect handling

If a query or mutation throws a `redirect(...)` error, the integration intercepts it on the client and performs a router navigation using the current location as `_fromLocation`.

- Enabled by default via `handleRedirects: true`
- Disable with `handleRedirects: false` if you need custom handling

Learn more about `redirect()` in the Router API: `https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction`.

## Options

```ts
import type { AnyRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export type Options<TRouter extends AnyRouter> = {
  router: TRouter
  queryClient: QueryClient
  /**
   * If true, intercept redirect() errors from queries/mutations and navigate.
   * Default: true
   */
  handleRedirects?: boolean
  /**
   * If true, wrap the router with <QueryClientProvider>. Default: true
   */
  wrapQueryClient?: boolean
}
```

## SSR behavior and streaming

- During server render, the integration dehydrates initial queries and streams any subsequent queries that resolve while rendering.
- On the client, the integration hydrates the initial state, then incrementally hydrates streamed queries.
- To opt into SSR for a route, use `ssr: true` or `ssr: 'data-only'`. Set `ssr: false` to disable.
- Queries from `useSuspenseQuery` or awaited loader prefetches participate in SSR/streaming. Plain `useQuery` does not execute on the server.

## Tips

- Create the `QueryClient` inside your `createRouter` (or per-request factory) in SSR environments.
- Prefer `loader` + `useSuspenseQuery` for critical route data.
- Use `defaultPreload: 'intent'` to prefetch on hover/focus for snappy navigations.

## Works with TanStack Start

TanStack Start uses TanStack Router under the hood. The same setup applies, and the integration will stream query results during SSR automatically.