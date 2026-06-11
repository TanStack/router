# Not Found Handling

Handle missing resources and routes.

## Route-Level Not Found

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) {
      throw notFound()
    }
    return post
  },
  notFoundComponent: () => (
    <div>
      <h1>Post Not Found</h1>
      <Link to="/posts">Back to Posts</Link>
    </div>
  ),
})
```

## Global Not Found

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
  notFoundComponent: () => (
    <div>
      <h1>404 - Page Not Found</h1>
      <Link to="/">Go Home</Link>
    </div>
  ),
})
```

## CatchNotFound Component

Catch not found in specific areas:

```tsx
import { CatchNotFound } from '@tanstack/react-router'

function PostsLayout() {
  return (
    <div>
      <h1>Posts</h1>
      <CatchNotFound fallback={<div>Post not found</div>}>
        <Outlet />
      </CatchNotFound>
    </div>
  )
}
```

## notFound() with Data

```tsx
throw notFound({ message: 'Post was deleted' })

// In component
notFoundComponent: ({ data }) => <div>{data?.message || 'Not found'}</div>
```

## Checking Not Found State

```tsx
import { useMatch } from '@tanstack/react-router'

function Component() {
  const match = useMatch({ from: '/posts/$postId', shouldThrow: false })

  if (match?.status === 'notFound') {
    return <NotFound />
  }
}
```

## Not Found vs Error

- **notFound()**: Resource doesn't exist (404)
- **throw Error**: Something went wrong (500)

```tsx
loader: async ({ params }) => {
  try {
    const post = await fetchPost(params.postId)
    if (!post) throw notFound() // 404
    return post
  } catch (e) {
    if (e instanceof NotFoundError) throw notFound()
    throw e // Re-throw other errors → errorComponent
  }
}
```

## API Reference

### notFound Function

```tsx
function notFound(options?: NotFoundOptions): never

interface NotFoundOptions {
  data?: any // Data to pass to notFoundComponent
  throw?: boolean // Default: true
  routeId?: string // Target route for not found
}

// Examples
throw notFound()
throw notFound({ data: { reason: 'deleted' } })
throw notFound({ routeId: '/posts' }) // Bubble up to specific route
```

### notFoundComponent

```tsx
interface NotFoundComponentProps {
  data?: any // Data from notFound()
}

// Route option
export const Route = createFileRoute('/posts/$id')({
  notFoundComponent: ({ data }) => <div>{data?.reason || 'Not found'}</div>,
})
```

### CatchNotFound Component

```tsx
interface CatchNotFoundProps {
  fallback:
    | React.ReactNode
    | ((props: { error: NotFoundError }) => React.ReactNode)
  children: React.ReactNode
}

// Usage
;<CatchNotFound fallback={<div>Not found</div>}>
  <Outlet />
</CatchNotFound>
```

### NotFoundError Type

```tsx
class NotFoundError extends Error {
  data?: any
  routeId?: string
}

// Check in code
if (error instanceof NotFoundError) {
  // Handle not found
}
```
