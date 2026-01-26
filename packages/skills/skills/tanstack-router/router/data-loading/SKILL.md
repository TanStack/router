---
name: tanstack-router-data-loading
description: |
  Data loading patterns in TanStack Router.
  Use for route loaders, preloading, deferred data, mutations, and TanStack Query integration.
---

# Data Loading

TanStack Router provides built-in data loading through route loaders. Data is fetched before the route renders, ensuring components have data on first render.

## Common Patterns

### Basic Route Loader

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetch(`/api/posts/${params.postId}`).then((r) =>
      r.json(),
    )
    return post
  },
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  return <article>{post.title}</article>
}
```

### Loader with Search Params

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: (search) => ({
    page: Number(search.page) || 1,
    filter: (search.filter as string) || '',
  }),
  loader: async ({ search }) => {
    return fetchPosts({ page: search.page, filter: search.filter })
  },
  component: PostsListComponent,
})

function PostsListComponent() {
  const { posts, total } = Route.useLoaderData()
  const { page } = Route.useSearch()
  // ...
}
```

### Loader Dependencies (Revalidation)

Control when loaders re-run based on specific values:

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: (search) => ({
    page: Number(search.page) || 1,
    filter: (search.filter as string) || '',
  }),
  // Only re-run loader when these values change
  loaderDeps: ({ search }) => ({
    page: search.page,
    filter: search.filter,
  }),
  loader: async ({ deps }) => {
    return fetchPosts({ page: deps.page, filter: deps.filter })
  },
})
```

### Parallel Data Loading

Load multiple resources simultaneously:

```tsx
export const Route = createFileRoute('/dashboard')({
  loader: async () => {
    const [user, stats, notifications] = await Promise.all([
      fetchUser(),
      fetchStats(),
      fetchNotifications(),
    ])
    return { user, stats, notifications }
  },
})
```

### Accessing Route Context

Use context for shared dependencies (auth, API clients):

```tsx
// In router setup
const router = createRouter({
  routeTree,
  context: {
    auth: authClient,
    queryClient: queryClient,
  },
})

// In route loader
export const Route = createFileRoute('/profile')({
  loader: async ({ context }) => {
    const user = await context.auth.getUser()
    return fetchProfile(user.id)
  },
})
```

### Deferred Data (Streaming)

Load critical data immediately, defer non-critical:

```tsx
import { defer, Await } from '@tanstack/react-router'
import { Suspense } from 'react'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId) // Wait for this
    return {
      post,
      comments: defer(fetchComments(params.postId)), // Stream this
    }
  },
  component: PostComponent,
})

function PostComponent() {
  const { post, comments } = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>

      <Suspense fallback={<div>Loading comments...</div>}>
        <Await promise={comments}>
          {(resolvedComments) => (
            <ul>
              {resolvedComments.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
          )}
        </Await>
      </Suspense>
    </article>
  )
}
```

### Preloading Routes

Preload data before navigation:

```tsx
// Automatic preloading on link hover
;<Link to="/posts/$postId" params={{ postId: '123' }} preload="intent">
  View Post
</Link>

// Manual preloading
const router = useRouter()

function prefetchPost(postId: string) {
  router.preloadRoute({
    to: '/posts/$postId',
    params: { postId },
  })
}
```

### Error Handling in Loaders

```tsx
import { notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)

    if (!post) {
      throw notFound() // Renders notFoundComponent
    }

    return post
  },
  // Error UI for unexpected errors
  errorComponent: ({ error }) => <div>Error: {error.message}</div>,
  // Not found UI
  notFoundComponent: () => <div>Post not found</div>,
})
```

### Cache Control (staleTime)

```tsx
export const Route = createFileRoute('/posts')({
  loader: async () => fetchPosts(),
  // Data stays fresh for 5 minutes
  staleTime: 5 * 60 * 1000,
  // Or force reload every navigation
  shouldReload: true,
})
```

## API Quick Reference

```tsx
// Loader function signature
interface LoaderFn {
  (context: {
    params: RouteParams           // Path parameters
    search: SearchParams          // Validated search params
    context: RouterContext        // Injected dependencies
    abortController: AbortController
    cause: 'enter' | 'stay'       // Why loader is running
    preload: boolean              // Is this a preload?
  }): Promise<Data> | Data
}

// Route loader options
interface RouteOptions {
  loader?: LoaderFn
  loaderDeps?: (opts) => Deps     // Values that trigger re-load
  staleTime?: number              // ms before data is stale
  shouldReload?: boolean | ((match) => boolean)
  gcTime?: number                 // Garbage collection time
  pendingComponent?: Component    // Show while loading
  errorComponent?: Component      // Show on error
  notFoundComponent?: Component   // Show on notFound()
}

// Hooks
Route.useLoaderData()             // Get loader data
Route.useLoaderDeps()             // Get current loader deps

// Deferred loading
defer(promise)                    // Mark promise for streaming
<Await promise={p}>{data => ...}</Await>  // Render deferred data

// Preloading
router.preloadRoute(opts)         // Manually preload
<Link preload="intent" />         // Auto preload on hover
```

## Detailed References

| Reference                  | When to Use                                         |
| -------------------------- | --------------------------------------------------- |
| `references/loaders.md`    | Loader patterns, context, params, error handling    |
| `references/deferred.md`   | Streaming with defer(), Await component, Suspense   |
| `references/preloading.md` | Preload strategies, manual preloading, prefetching  |
| `references/mutations.md`  | Data mutations, invalidation, optimistic updates    |
| `references/external.md`   | TanStack Query integration, external data sources   |
| `references/caching.md`    | staleTime, gcTime, cache invalidation, shouldReload |
