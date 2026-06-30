# Loaders

Data fetching functions that run before route rendering.

## Basic Loader

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  component: PostComponent,
})

function PostComponent() {
  const { post } = Route.useLoaderData()
  return <article>{post.title}</article>
}
```

## Loader Parameters

```tsx
loader: async ({
  params, // Path parameters
  search, // Search parameters (validated)
  context, // Router context
  abortController, // For cancellation
  cause, // Why loader is running
  location, // Current location
  preload, // Is this a preload?
}) => {
  return data
}
```

## Loader Context

Access injected dependencies:

```tsx
// Router setup
const router = createRouter({
  routeTree,
  context: {
    apiClient: new ApiClient(),
    queryClient,
  },
})

// In route
loader: async ({ context }) => {
  return context.apiClient.getPosts()
}
```

## Parallel Loaders

Loaders at same level run in parallel:

```
/posts (loader1)
  /posts/$id (loader2)
```

Both loaders run in parallel when navigating to `/posts/123`.

## Sequential with beforeLoad

Use `beforeLoad` for auth checks that must complete first:

```tsx
export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ context }) => {
    // Runs before loader
    const user = await context.auth.getUser()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  loader: async ({ context }) => {
    // Has access to beforeLoad return via context
    return fetchDashboard(context.user.id)
  },
})
```

## Abort Controller

Handle cancellation:

```tsx
loader: async ({ abortController }) => {
  const response = await fetch('/api/posts', {
    signal: abortController.signal,
  })
  return response.json()
}
```

## Error Handling

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw notFound()
    return post
  },
  errorComponent: ({ error }) => <div>Error: {error.message}</div>,
  notFoundComponent: () => <div>Post not found</div>,
})
```

## API Reference

### Loader Function

```tsx
interface LoaderFn<TRoute> {
  (context: LoaderFnContext<TRoute>): Promise<TLoaderData> | TLoaderData
}

interface LoaderFnContext<TRoute> {
  params: TRoute['params'] // Path parameters
  search: TRoute['search'] // Validated search params
  context: RouterContext // Router context (injected deps)
  abortController: AbortController // For cancellation
  cause: 'enter' | 'stay' // Why loader is running
  location: ParsedLocation // Current location
  preload: boolean // Is this a preload?
  parentMatchPromise: Promise<RouteMatch> // Parent match
}
```

### useLoaderData Hook

```tsx
function useLoaderData<TFrom, TStrict, TSelected>(options?: {
  from?: TFrom // Route ID
  strict?: TStrict // Default: true
  select?: (data) => TSelected // Transform data
  structuralSharing?: boolean // Enable structural sharing
}): TSelected | LoaderData

// Example
const data = Route.useLoaderData() // Full loader data
const title = Route.useLoaderData({ select: (d) => d.post.title })
```

### beforeLoad Function

```tsx
interface BeforeLoadFn<TRoute> {
  (context: BeforeLoadFnContext<TRoute>): Promise<void> | void | NewContext
}

interface BeforeLoadFnContext<TRoute> {
  params: TRoute['params']
  search: TRoute['search']
  context: RouterContext
  location: ParsedLocation
  cause: 'enter' | 'stay'
  abortController: AbortController
}
```

### Route Options

```tsx
interface RouteOptions {
  loader?: LoaderFn
  beforeLoad?: BeforeLoadFn
  loaderDeps?: (opts: { search: Search }) => Deps // Revalidate on change
  staleTime?: number // Time before stale (ms)
  shouldReload?: boolean | ((match) => boolean) // Force reload logic
  gcTime?: number // Garbage collection time
}
```
