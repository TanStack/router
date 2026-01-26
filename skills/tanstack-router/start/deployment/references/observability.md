# Observability

Logging, monitoring, and error tracking.

## Structured Logging

```tsx
import { createMiddleware } from '@tanstack/start'

const loggingMiddleware = createMiddleware().server(async ({ next, data }) => {
  const start = Date.now()
  const requestId = crypto.randomUUID()

  console.log(
    JSON.stringify({
      type: 'request',
      requestId,
      timestamp: new Date().toISOString(),
      data,
    }),
  )

  try {
    const result = await next()

    console.log(
      JSON.stringify({
        type: 'response',
        requestId,
        duration: Date.now() - start,
        success: true,
      }),
    )

    return result
  } catch (error) {
    console.error(
      JSON.stringify({
        type: 'error',
        requestId,
        duration: Date.now() - start,
        error: error.message,
        stack: error.stack,
      }),
    )
    throw error
  }
})
```

## Error Tracking (Sentry)

```tsx
// lib/sentry.ts
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
})

// In server functions
const riskyOperation = createServerFn().handler(async () => {
  try {
    return await doSomething()
  } catch (error) {
    Sentry.captureException(error)
    throw error
  }
})
```

## Performance Monitoring

```tsx
const performanceMiddleware = createMiddleware().server(async ({ next }) => {
  const start = performance.now()
  const result = await next()
  const duration = performance.now() - start

  // Report slow operations
  if (duration > 1000) {
    console.warn(`Slow operation: ${duration}ms`)
  }

  return result
})
```

## Request Tracing

```tsx
import { getRequestHeader, setResponseHeader } from 'vinxi/http'

const tracingMiddleware = createMiddleware().server(async ({ next }) => {
  const traceId = getRequestHeader('x-trace-id') || crypto.randomUUID()
  setResponseHeader('x-trace-id', traceId)

  // Add to logging context
  return next({ context: { traceId } })
})
```

## Metrics

```tsx
// lib/metrics.ts
const metrics = {
  requestCount: 0,
  errorCount: 0,
  latencies: [] as number[],
}

export const metricsMiddleware = createMiddleware().server(async ({ next }) => {
  metrics.requestCount++
  const start = Date.now()

  try {
    return await next()
  } catch (error) {
    metrics.errorCount++
    throw error
  } finally {
    metrics.latencies.push(Date.now() - start)
  }
})
```
