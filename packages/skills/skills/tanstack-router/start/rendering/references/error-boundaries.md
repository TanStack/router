# Error Boundaries (Start)

Server-side error handling in TanStack Start.

## Route Error Component

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw new Error('Post not found')
    return post
  },
  errorComponent: ({ error, reset }) => (
    <div className="error">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
})
```

## Global Error Boundary

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
  errorComponent: ({ error }) => {
    // Log to monitoring service
    if (typeof window !== 'undefined') {
      Sentry.captureException(error)
    }

    return (
      <html>
        <body>
          <h1>Application Error</h1>
          <p>Something went wrong. Please try again.</p>
          <a href="/">Go Home</a>
        </body>
      </html>
    )
  },
})
```

## Server Function Errors

```tsx
const riskyOperation = createServerFn().handler(async () => {
  try {
    return await performOperation()
  } catch (error) {
    // Log server-side
    console.error('Server error:', error)

    // Return safe error to client
    throw new Error('Operation failed. Please try again.')
  }
})
```

## Error Types

```tsx
// Custom error classes
class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// Handle by type
errorComponent: ({ error }) => {
  if (error instanceof NotFoundError) {
    return <NotFoundPage message={error.message} />
  }
  if (error instanceof UnauthorizedError) {
    return <LoginPrompt />
  }
  return <GenericError />
}
```

## SSR Error Handling

```tsx
// Errors during SSR
export const Route = createFileRoute('/ssr-page')({
  loader: async () => {
    // If this throws during SSR:
    // 1. Error boundary catches it
    // 2. Error page is server-rendered
    // 3. Client receives error HTML
    throw new Error('SSR failed')
  },
  errorComponent: ErrorPage, // Rendered on server
})
```

## Pending vs Error States

```tsx
export const Route = createFileRoute('/data')({
  pendingComponent: () => <Skeleton />, // While loading
  errorComponent: (
    { error, reset }, // On error
  ) => (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  ),
})
```
