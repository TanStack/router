---
name: Observability
description: Logging, tracing, and monitoring patterns for Start apps.
version: 1
source: docs/start/framework/react/guide/observability.md
---

# Observability

## Summary

- Use middleware and server entry points for request logging and tracing.
- Centralize error reporting with tools like Sentry.
- Add health checks and metrics for production monitoring.

## Use cases

- Capture server function errors with context
- Track loader timing and slow routes
- Add request IDs and correlation across logs

## Notes

- Avoid logging secrets or PII.
- Prefer structured logs for analysis.

## Examples

```ts
const requestLogger = async ({ request, next }) => {
  const start = Date.now()
  const response = await next()
  console.info('request', {
    method: request.method,
    url: request.url,
    ms: Date.now() - start,
  })
  return response
}
```
