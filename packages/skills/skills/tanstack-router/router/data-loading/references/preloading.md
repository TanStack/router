# Preloading

Load route data before navigation for instant transitions.

## Preload Strategies

```tsx
// Preload on hover intent (default)
<Link to="/posts" preload="intent">Posts</Link>

// Preload when link renders
<Link to="/posts" preload="render">Posts</Link>

// Preload when link enters viewport
<Link to="/posts" preload="viewport">Posts</Link>

// Disable preloading
<Link to="/posts" preload={false}>Posts</Link>
```

## Intent Preloading

Default behavior - preloads after hover delay:

```tsx
<Link
  to="/posts"
  preload="intent"
  preloadDelay={50} // ms before preload starts (default: 50)
>
  Posts
</Link>
```

## Manual Preloading

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  const handleMouseEnter = () => {
    router.preloadRoute({ to: '/posts/$postId', params: { postId: '123' } })
  }

  return <div onMouseEnter={handleMouseEnter}>Hover me</div>
}
```

## Preload Cache Time

Control how long preloaded data stays fresh:

```tsx
const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 30_000, // 30 seconds
})

// Per-route override
export const Route = createFileRoute('/posts')({
  preloadStaleTime: 60_000, // 1 minute
})
```

## Preload All Routes

Preload everything on app start:

```tsx
// After router is ready
router.preloadRoute({ to: '/posts' })
router.preloadRoute({ to: '/about' })
```

## Preload in Loader

Preload child routes:

```tsx
export const Route = createFileRoute('/posts')({
  loader: async ({ preload }) => {
    const posts = await fetchPosts()

    if (!preload) {
      // Preload first post for likely navigation
      router.preloadRoute({
        to: '/posts/$postId',
        params: { postId: posts[0].id },
      })
    }

    return { posts }
  },
})
```
