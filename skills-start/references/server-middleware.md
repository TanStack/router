---
name: Middleware
description: Request and server function middleware in Start.
version: 1
source: docs/start/framework/react/guide/middleware.md
---

# Middleware

## Summary

- Middleware runs for SSR requests, server routes, and server functions.
- Request middleware is server-only; function middleware can run client and server.
- Middleware is composable and must call `next()`.

## Notes

- Configure globals in `createStart` via `requestMiddleware` and `functionMiddleware`.
- Use `next({ context })` and `sendContext` for typed context.
- Validate any client-sent context.

## Use cases

- Add auth and session checks for requests
- Attach request-scoped context to handlers
- Customize headers or fetch for server functions

## Notes

- Middleware must call `next()` to continue.
- Request middleware runs server-only.

## Examples

```ts
const authMiddleware = async ({ next }) => {
  const session = await getSession()
  return next({ context: { session } })
}
```
