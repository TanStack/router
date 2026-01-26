---
name: Server routes
description: Define HTTP endpoints and middleware via server route handlers.
version: 1
source: docs/start/framework/react/guide/server-routes.md
---

# Server routes

## Summary

- Define server routes with `createFileRoute` and `server.handlers`.
- You can co-locate app routes and server routes in the same file.
- Route file naming follows the same conventions as Router.

## Behavior

- Handlers receive `request`, `params`, and `context` and return a `Response`.
- Middleware can apply at the route or handler level.
- Start handles server routing automatically or via `createStartHandler`.

## Use cases

- Build JSON APIs inside the routes tree
- Add route-specific middleware
- Return file downloads or streaming responses

## Notes

- Handlers return a `Response` object.
- Server routes can live alongside app routes.

## Examples

```ts
export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async () => Response.json(await listUsers()),
    },
  },
})
```
