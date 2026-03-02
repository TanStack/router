---
name: tanstack-start-rendering
description: |
  Rendering modes in TanStack Start.
  Use for SSR, streaming, static generation, ISR, SPA mode, hydration.
---

# Rendering

TanStack Start supports multiple rendering modes: SSR (default), streaming SSR, static generation, and client-only SPA mode.

## Common Patterns

### Server-Side Rendering (Default)

Routes are SSR'd by default. Loaders run on the server during initial request:

```tsx
export const Route = createFileRoute('/posts')({
  loader: async () => {
    // Runs on server for initial request
    // Runs on client for subsequent navigations
    const posts = await fetchPosts()
    return { posts }
  },
  component: PostsComponent,
})

function PostsComponent() {
  const { posts } = Route.useLoaderData()
  // posts are immediately available - no loading state needed for SSR
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Streaming SSR with Defer

Stream non-critical data while sending critical content immediately:

```tsx
import { defer, Await } from '@tanstack/react-router'
import { Suspense } from 'react'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    // Critical: wait for post content
    const post = await fetchPost(params.postId)

    // Non-critical: stream comments later
    return {
      post,
      comments: defer(fetchComments(params.postId)),
      relatedPosts: defer(fetchRelatedPosts(params.postId)),
    }
  },
  component: PostComponent,
})

function PostComponent() {
  const { post, comments, relatedPosts } = Route.useLoaderData()

  return (
    <article>
      {/* Renders immediately */}
      <h1>{post.title}</h1>
      <p>{post.content}</p>

      {/* Streams when ready */}
      <Suspense fallback={<div>Loading comments...</div>}>
        <Await promise={comments}>
          {(data) => (
            <ul>
              {data.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
          )}
        </Await>
      </Suspense>

      <Suspense fallback={<div>Loading related...</div>}>
        <Await promise={relatedPosts}>
          {(data) => <RelatedPosts posts={data} />}
        </Await>
      </Suspense>
    </article>
  )
}
```

### Static Generation (SSG)

Pre-render pages at build time:

```tsx
export const Route = createFileRoute('/about')({
  // Mark as static
  preload: false,
  staticData: true,

  loader: async () => {
    // Runs at build time only
    const content = await getAboutContent()
    return { content }
  },
  component: AboutComponent,
})
```

### Client-Only Components (No SSR)

For components that can't be server-rendered (browser APIs, etc.):

```tsx
import { ClientOnly } from '@tanstack/react-router'

function MapComponent() {
  return (
    <ClientOnly fallback={<div>Loading map...</div>}>
      {() => <InteractiveMap />} {/* Only renders on client */}
    </ClientOnly>
  )
}
```

### SPA Mode (Disable SSR)

For routes that should only render on the client:

```tsx
export const Route = createFileRoute('/dashboard')({
  // Disable SSR for this route
  ssr: false,

  loader: async () => {
    // Only runs on client
    return { data: await fetchDashboardData() }
  },
  component: DashboardComponent,

  // Show while loading on client
  pendingComponent: () => <DashboardSkeleton />,
})
```

### Pending/Loading States

```tsx
export const Route = createFileRoute('/posts')({
  loader: async () => {
    await new Promise((r) => setTimeout(r, 1000)) // Simulate slow load
    return { posts: await fetchPosts() }
  },

  // Show during client-side navigation
  pendingComponent: () => (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  ),

  // Minimum time to show pending (prevents flash)
  pendingMinMs: 200,

  // Delay before showing pending
  pendingMs: 100,
})
```

### Error Boundaries

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw notFound()
    return post
  },

  component: PostComponent,

  // Error UI
  errorComponent: ({ error, reset }) => (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),

  // 404 UI
  notFoundComponent: () => (
    <div>
      <h2>Post not found</h2>
      <Link to="/posts">Back to posts</Link>
    </div>
  ),
})
```

### Hydration with Context

```tsx
// Pass server data to client via context
export const Route = createRootRoute({
  loader: async () => {
    const user = await getCurrentUser()
    return { user }
  },
  component: RootComponent,
})

function RootComponent() {
  const { user } = Route.useLoaderData()

  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        <UserContext.Provider value={user}>
          <Outlet />
        </UserContext.Provider>
        <Scripts />
      </Body>
    </Html>
  )
}
```

## API Quick Reference

```tsx
// Streaming
defer(promise)                    // Mark for streaming
<Await promise={p}>{data => ...}</Await>  // Render streamed data

// Client-only rendering
<ClientOnly fallback={...}>{() => <Component />}</ClientOnly>
ssr: false                        // Disable SSR for route

// Route rendering options
interface RouteOptions {
  ssr?: boolean                   // Enable/disable SSR (default: true)
  staticData?: boolean            // Static generation
  pendingComponent?: Component    // Loading UI
  pendingMs?: number              // Delay before pending (default: 1000)
  pendingMinMs?: number           // Min pending duration (default: 500)
  errorComponent?: Component      // Error UI
  notFoundComponent?: Component   // 404 UI
}

// Start components for root
import { Html, Head, Body, Meta, Scripts, Links } from '@tanstack/react-start'
```

## Detailed References

| Reference                        | When to Use                                       |
| -------------------------------- | ------------------------------------------------- |
| `references/ssr.md`              | SSR configuration, server rendering behavior      |
| `references/streaming.md`        | Streaming SSR, defer(), Suspense patterns         |
| `references/static.md`           | Static generation, ISR, build-time rendering      |
| `references/spa-mode.md`         | Client-only rendering, disabling SSR              |
| `references/hydration.md`        | Hydration process, debugging hydration mismatches |
| `references/error-boundaries.md` | Error and not-found component patterns            |
| `references/markdown.md`         | MDX integration, markdown rendering               |
| `references/selective-ssr.md`    | Per-route SSR control                             |
