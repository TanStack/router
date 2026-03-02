# Server Function Middleware

Reusable middleware for server functions.

## Basic Middleware

```tsx
import { createServerFn, createMiddleware } from '@tanstack/start'

const loggingMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Request started')
  const result = await next()
  console.log('Request completed')
  return result
})

const getData = createServerFn()
  .middleware([loggingMiddleware])
  .handler(async () => {
    return { data: 'value' }
  })
```

## Auth Middleware

```tsx
const authMiddleware = createMiddleware().server(async ({ next }) => {
  const session = await getSession()

  if (!session?.userId) {
    throw new Error('Unauthorized')
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
  })

  // Pass user to handler via context
  return next({ context: { user } })
})

const getSecretData = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    // context.user is available and typed
    return db.secrets.findMany({
      where: { userId: context.user.id },
    })
  })
```

## Chaining Middleware

```tsx
const timerMiddleware = createMiddleware().server(async ({ next }) => {
  const start = Date.now()
  const result = await next()
  console.log(`Took ${Date.now() - start}ms`)
  return result
})

const getData = createServerFn()
  .middleware([loggingMiddleware, authMiddleware, timerMiddleware])
  .handler(async ({ context }) => {
    // All middleware executed in order
  })
```

## Middleware with Input

```tsx
const rateLimitMiddleware = createMiddleware().server(
  async ({ next, data }) => {
    const key = `rate:${data?.userId || 'anonymous'}`
    const count = await redis.incr(key)

    if (count > 100) {
      throw new Error('Rate limit exceeded')
    }

    return next()
  },
)
```

## Error Handling in Middleware

```tsx
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    // Log error
    console.error('Server function error:', error)
    // Re-throw or return error response
    throw error
  }
})
```
