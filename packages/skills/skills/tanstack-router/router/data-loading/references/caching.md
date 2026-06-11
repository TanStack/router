# Caching

Built-in cache management for loader data.

## Default Behavior

Loader data is cached by route and params:

```tsx
// First visit to /posts/123 → loader runs
// Navigate away and back → cached data used
// Full page reload → loader runs again
```

## Cache Configuration

```tsx
const router = createRouter({
  routeTree,
  defaultStaleTime: 0, // How long data stays fresh (ms)
  defaultPreloadStaleTime: 30_000, // For preloaded data
  defaultGcTime: 30 * 60 * 1000, // Garbage collection time
})
```

## Per-Route Cache Settings

```tsx
export const Route = createFileRoute('/posts')({
  staleTime: 60_000, // 1 minute
  gcTime: 5 * 60 * 1000, // 5 minutes
  loader: async () => fetchPosts(),
})
```

## Cache Keys

Routes are cached by their full match:

```
/posts         → cache key: /posts
/posts?page=1  → cache key: /posts?page=1
/posts?page=2  → cache key: /posts?page=2
/posts/123     → cache key: /posts/123
```

## Manual Invalidation

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  // Invalidate all loaders
  router.invalidate()

  // Invalidate will refetch active routes
}
```

## shouldReload

Control when loader re-runs:

```tsx
export const Route = createFileRoute('/posts')({
  shouldReload: ({ cause }) => {
    // Only reload on explicit navigation, not search changes
    return cause === 'enter'
  },
  loader: async () => fetchPosts(),
})
```

## Cause Values

- `'enter'` - Initial route entry
- `'stay'` - Params/search changed but same route
- `'preload'` - Preloading
