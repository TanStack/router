# Error Boundaries

Handle and recover from errors in routes.

## Route Error Component

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return post
  },
  errorComponent: ({ error, reset }) => (
    <div>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
})
```

## Error Component Props

```tsx
errorComponent: ({
  error, // The caught error
  reset, // Function to retry the route
  info, // Error info (componentStack)
}) => {
  // Handle error
}
```

## Global Error Boundary

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
  errorComponent: ({ error }) => (
    <div className="error-page">
      <h1>Application Error</h1>
      <pre>{error.message}</pre>
      <Link to="/">Go Home</Link>
    </div>
  ),
})
```

## Error Recovery

```tsx
function RouteError({ error, reset }) {
  const [retryCount, setRetryCount] = useState(0)

  const handleRetry = () => {
    if (retryCount < 3) {
      setRetryCount((c) => c + 1)
      reset()
    }
  }

  return (
    <div>
      <p>Error: {error.message}</p>
      {retryCount < 3 ? (
        <button onClick={handleRetry}>
          Retry ({3 - retryCount} attempts left)
        </button>
      ) : (
        <p>Max retries reached. Please refresh the page.</p>
      )}
    </div>
  )
}
```

## Throwing Errors

```tsx
export const Route = createFileRoute('/api-test')({
  loader: async () => {
    const response = await fetch('/api/data')
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }
    return response.json()
  },
})
```

## Error Logging

```tsx
errorComponent: ({ error }) => {
  useEffect(() => {
    // Log to error tracking service
    Sentry.captureException(error)
  }, [error])

  return <div>Something went wrong</div>
}
```

## Pending Component

Show loading state while route loads:

```tsx
export const Route = createFileRoute('/posts')({
  pendingComponent: () => <div>Loading posts...</div>,
  loader: async () => fetchPosts(),
})
```
