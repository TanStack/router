---
name: compositions/router-query
description: >-
  Integrating TanStack Solid Router with TanStack Query: queryClient
  in router context, ensureQueryData/prefetchQuery in loaders,
  createQuery in components, defaultPreloadStaleTime: 0,
  per-request QueryClient isolation for SSR.
type: composition
library: tanstack-router
library_version: '1.166.2'
requires:
  - router-core
  - router-core/data-loading
  - solid-router
sources:
  - TanStack/router:docs/router/guide/external-data-loading.md
  - TanStack/router:docs/router/integrations/query.md
---

# TanStack Solid Router + TanStack Query Integration

This skill requires familiarity with both TanStack Router and TanStack Query. Read [router-core](../../../../router-core/skills/router-core/SKILL.md) and [solid-router](../../solid-router/SKILL.md) first.

This skill covers coordinating TanStack Query as an external data cache with TanStack Router's loader system in Solid applications. The router acts as a **coordinator** — it triggers data fetching during navigation, while Query manages caching, background refetching, and data lifecycle.

> **CRITICAL**: Set `defaultPreloadStaleTime: 0` when using TanStack Query. Without this, Router's built-in preload cache (30s default) prevents Query from controlling data freshness.

> **CRITICAL**: For SSR, create `QueryClient` inside the `createRouter` factory function. A module-level singleton leaks data between server requests.

## Setup: QueryClient in Router Context

### Basic (Client-Only)

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import {
  RouterProvider,
  createRouter,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
  context: { queryClient },
  Wrap: (props) => (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  ),
})

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return <RouterProvider router={router} />
}
```

### Root Route with Context

```tsx
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/solid-router'
import type { QueryClient } from '@tanstack/solid-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: () => <Outlet />,
})
```

### SSR-Safe Setup

```tsx
// src/router.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    Wrap: (props) => (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    ),
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

## Core Pattern: `ensureQueryData` in Loader + `createQuery` in Component

The loader ensures data is in the cache before render (no loading flash). The component subscribes to the cache for updates using Solid's reactive primitives.

```tsx
// src/routes/posts.tsx
import { queryOptions, createQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { For } from 'solid-js'

interface Post {
  id: string
  title: string
}

const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: (): Promise<Array<Post>> =>
    fetch('/api/posts').then((r) => r.json()),
})

export const Route = createFileRoute('/posts')({
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(postsQueryOptions)
  },
  component: PostsPage,
})

function PostsPage() {
  const postsQuery = createQuery(() => postsQueryOptions)

  return (
    <ul>
      <For each={postsQuery.data}>
        {(post) => <li>{post.title}</li>}
      </For>
    </ul>
  )
}
```

### With Dynamic Params

```tsx
// src/routes/posts/$postId.tsx
import { queryOptions, createQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'

interface Post {
  id: string
  title: string
  content: string
}

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['posts', postId],
    queryFn: () => fetch(`/api/posts/${postId}`).then((r) => r.json()),
  })

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context, params }) => {
    return context.queryClient.ensureQueryData(postQueryOptions(params.postId))
  },
  component: PostPage,
})

function PostPage() {
  const params = Route.useParams()
  const postQuery = createQuery(() => postQueryOptions(params().postId))

  return <article>{postQuery.data?.title}</article>
}
```

## Streaming Pattern: `prefetchQuery` (Not Awaited)

For non-critical data, start the fetch without blocking navigation:

```tsx
import { createQuery } from '@tanstack/solid-query'
import { Show } from 'solid-js'

export const Route = createFileRoute('/dashboard')({
  loader: ({ context }) => {
    const user = context.queryClient.ensureQueryData(userQueryOptions)
    context.queryClient.prefetchQuery(analyticsQueryOptions)
    return user
  },
  component: Dashboard,
})

function Dashboard() {
  const userQuery = createQuery(() => userQueryOptions)
  const analyticsQuery = createQuery(() => analyticsQueryOptions)

  return (
    <div>
      <h1>Welcome {userQuery.data?.name}</h1>
      <Show when={!analyticsQuery.isLoading} fallback={<Skeleton />}>
        <AnalyticsChart data={analyticsQuery.data} />
      </Show>
    </div>
  )
}
```

## Common Mistakes

### 1. HIGH: Not setting `defaultPreloadStaleTime` to 0

Router has a built-in preload cache (default `staleTime` for preloads is 30s). This prevents Query from controlling data freshness during preloading.

```tsx
// WRONG — Router's preload cache serves stale data, Query never refetches
const router = createRouter({ routeTree })

// CORRECT — disable Router's preload cache, let Query manage freshness
const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
})
```

### 2. HIGH: Creating QueryClient outside `createRouter` for SSR

A module-level singleton `QueryClient` is shared across all server requests, leaking user data between requests.

```tsx
// WRONG — shared across SSR requests
const queryClient = new QueryClient()
export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { queryClient },
  })
}

// CORRECT — new QueryClient per createAppRouter call
export function createAppRouter() {
  const queryClient = new QueryClient()
  return createRouter({
    routeTree,
    context: { queryClient },
  })
}
```

### 3. MEDIUM: Awaiting `prefetchQuery` in loader blocks rendering

`prefetchQuery` is designed to fire-and-forget. Awaiting it blocks the navigation transition.

```tsx
// WRONG — blocks navigation
loader: async ({ context }) => {
  await context.queryClient.prefetchQuery(analyticsQueryOptions)
}

// CORRECT — fire and forget for streaming
loader: ({ context }) => {
  context.queryClient.prefetchQuery(analyticsQueryOptions)
}
```

### 4. HIGH: Missing double parentheses on `createRootRouteWithContext`

```tsx
// WRONG
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>({
  component: RootComponent,
})

// CORRECT — double call: factory()({options})
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
})
```

### 5. MEDIUM: Using React Query patterns instead of Solid Query

Solid Query uses `createQuery` (not `useQuery`) and returns reactive getters. Query options are passed as a function returning options, not directly.

```tsx
// WRONG — React pattern
const { data } = useQuery(postsQueryOptions)

// CORRECT — Solid pattern
const postsQuery = createQuery(() => postsQueryOptions)
// Access: postsQuery.data (reactive getter)
```

## Cross-References

- [router-core/data-loading](../../../../router-core/skills/router-core/data-loading/SKILL.md) — built-in loader caching fundamentals
- [router-core/ssr](../../../../router-core/skills/router-core/ssr/SKILL.md) — SSR setup for dehydration/hydration
