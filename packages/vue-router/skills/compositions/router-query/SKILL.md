---
name: compositions/router-query
description: >-
  Integrating TanStack Vue Router with TanStack Query: queryClient
  in router context, ensureQueryData/prefetchQuery in loaders,
  useQuery in components, defaultPreloadStaleTime: 0,
  per-request QueryClient isolation for SSR.
type: composition
library: tanstack-router
library_version: '1.166.2'
requires:
  - router-core
  - router-core/data-loading
  - vue-router
sources:
  - TanStack/router:docs/router/guide/external-data-loading.md
  - TanStack/router:docs/router/integrations/query.md
---

# TanStack Vue Router + TanStack Query Integration

This skill requires familiarity with both TanStack Router and TanStack Query. Read [router-core](../../../../router-core/skills/router-core/SKILL.md) and [vue-router](../../vue-router/SKILL.md) first.

This skill covers coordinating TanStack Query as an external data cache with TanStack Router's loader system in Vue applications. The router acts as a **coordinator** — it triggers data fetching during navigation, while Query manages caching, background refetching, and data lifecycle.

> **CRITICAL**: Set `defaultPreloadStaleTime: 0` when using TanStack Query. Without this, Router's built-in preload cache (30s default) prevents Query from controlling data freshness.

> **CRITICAL**: For SSR, create `QueryClient` inside the `createRouter` factory function. A module-level singleton leaks data between server requests.

## Setup: QueryClient in Router Context

### Basic (Client-Only)

```ts
// src/main.ts
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'
import { RouterProvider, createRouter, createRootRouteWithContext } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
  context: { queryClient },
})

declare module '@tanstack/vue-router' {
  interface Register {
    router: typeof router
  }
}

const app = createApp(RouterProvider, { router })
app.use(VueQueryPlugin, { queryClient })
app.mount('#app')
```

### Root Route with Context

```ts
// src/routes/__root.ts
import { createRootRouteWithContext } from '@tanstack/vue-router'
import type { QueryClient } from '@tanstack/vue-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: () => import('./RootComponent.vue'),
})
```

### SSR-Safe Setup

```ts
// src/router.ts
import { QueryClient } from '@tanstack/vue-query'
import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

## Core Pattern: `ensureQueryData` in Loader + `useQuery` in Component

The loader ensures data is in the cache before render (no loading flash). The component subscribes to the cache for updates using Vue's reactive refs.

```vue
<!-- src/routes/posts.vue -->
<script setup lang="ts">
import { useQuery, queryOptions } from '@tanstack/vue-query'

interface Post {
  id: string
  title: string
}

const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: (): Promise<Post[]> =>
    fetch('/api/posts').then((r) => r.json()),
})

const { data: posts } = useQuery(postsQueryOptions)
</script>

<template>
  <ul>
    <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
  </ul>
</template>
```

```ts
// src/routes/posts.ts (route definition)
import { createFileRoute } from '@tanstack/vue-router'
import { queryOptions } from '@tanstack/vue-query'

const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: (): Promise<Array<{ id: string; title: string }>> =>
    fetch('/api/posts').then((r) => r.json()),
})

export const Route = createFileRoute('/posts')({
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(postsQueryOptions)
  },
  component: () => import('./posts.vue'),
})
```

### With Dynamic Params

```ts
// src/routes/posts/$postId.ts
import { createFileRoute } from '@tanstack/vue-router'
import { queryOptions } from '@tanstack/vue-query'

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['posts', postId],
    queryFn: () => fetch(`/api/posts/${postId}`).then((r) => r.json()),
  })

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context, params }) => {
    return context.queryClient.ensureQueryData(postQueryOptions(params.postId))
  },
  component: () => import('./PostPage.vue'),
})
```

```vue
<!-- src/routes/PostPage.vue -->
<script setup lang="ts">
import { useQuery, queryOptions } from '@tanstack/vue-query'
import { useParams } from '@tanstack/vue-router'

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['posts', postId],
    queryFn: () => fetch(`/api/posts/${postId}`).then((r) => r.json()),
  })

const params = useParams({ from: '/posts/$postId' })
const { data: post } = useQuery(postQueryOptions(params.value.postId))
</script>

<template>
  <article>{{ post?.title }}</article>
</template>
```

## Streaming Pattern: `prefetchQuery` (Not Awaited)

For non-critical data, start the fetch without blocking navigation:

```ts
export const Route = createFileRoute('/dashboard')({
  loader: ({ context }) => {
    const user = context.queryClient.ensureQueryData(userQueryOptions)
    context.queryClient.prefetchQuery(analyticsQueryOptions)
    return user
  },
  component: () => import('./Dashboard.vue'),
})
```

## Common Mistakes

### 1. HIGH: Not setting `defaultPreloadStaleTime` to 0

Router has a built-in preload cache (default `staleTime` for preloads is 30s). This prevents Query from controlling data freshness during preloading.

```ts
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

```ts
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

```ts
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

```ts
// WRONG
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>({
  component: RootComponent,
})

// CORRECT — double call: factory()({options})
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
})
```

## Cross-References

- [router-core/data-loading](../../../../router-core/skills/router-core/data-loading/SKILL.md) — built-in loader caching fundamentals
- [router-core/ssr](../../../../router-core/skills/router-core/ssr/SKILL.md) — SSR setup for dehydration/hydration
