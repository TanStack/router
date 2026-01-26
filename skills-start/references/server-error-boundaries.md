---
name: Error boundaries
description: Error components and reset behavior.
version: 1
source: docs/start/framework/react/guide/error-boundaries.md
---

# Error boundaries

## Summary

- Use `defaultErrorComponent` on the router.
- Override per route with `errorComponent`.
- Use `reset()` to retry rendering.

## Use cases

- Show fallback UI for loader errors
- Provide retry flows for recoverable issues
- Customize error output per route

## Notes

- Error boundaries are configured at the route level.
- Use `defaultErrorComponent` for global defaults.

## Examples

```tsx
export const Route = createFileRoute('/settings')({
  errorComponent: ({ error, reset }) => (
    <ErrorView error={error} onRetry={reset} />
  ),
})
```
