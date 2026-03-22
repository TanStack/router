# Code Splitting

Automatic and manual lazy loading for routes.

## Automatic (File-Based)

File-based routes are automatically code-split:

```tsx
// routes/posts.tsx → separate chunk
// routes/settings.tsx → separate chunk
```

Each route file becomes its own bundle chunk.

## Manual Code Splitting

### Lazy Components

```tsx
import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'

const PostComponent = lazy(() => import('./PostComponent'))

const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts/$postId',
  component: PostComponent,
})
```

### Lazy Loaders

```tsx
const postRoute = createRoute({
  path: 'posts/$postId',
  loader: async ({ params }) => {
    const { fetchPost } = await import('./api')
    return fetchPost(params.postId)
  },
})
```

## Split Configuration

In file-based routing, split specific route parts:

```tsx
// routes/posts.$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  component: () => import('./PostComponent').then((m) => m.PostComponent),
})
```

## Chunk Naming

Configure chunk names in bundler:

```ts
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'post-editor': ['./src/routes/posts/editor.tsx'],
        },
      },
    },
  },
})
```

## Preloading Split Routes

```tsx
<Link to="/posts/$postId" params={{ postId: '123' }} preload="intent">
  View Post
</Link>
```

Preloading fetches the code chunk before navigation.

## Critical vs Non-Critical

```tsx
// Critical - loaded with route
export const Route = createFileRoute('/posts/$postId')({
  component: PostComponent, // In main chunk
})

// Non-critical - lazy loaded
function PostComponent() {
  const Comments = lazy(() => import('./Comments'))

  return (
    <div>
      <PostContent />
      <Suspense fallback={<div>Loading comments...</div>}>
        <Comments />
      </Suspense>
    </div>
  )
}
```
