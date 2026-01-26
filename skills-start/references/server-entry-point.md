---
name: Server entry point
description: Server entry configuration and request context.
version: 1
source: docs/start/framework/react/guide/server-entry-point.md
---

# Server entry point

## Summary

- Optional `src/server.ts` customizes server handling.
- Use `createStartHandler` or `defaultStreamHandler`.
- Request context can be typed and passed via middleware.

## Use cases

- Customize server request handling
- Inject app-wide middleware
- Provide request context to router

## Notes

- The default server entry is provided if none exists.
- Extend `Register.server.requestContext` for typing.

## Examples

```ts
export default createServerEntry((handler) => {
  return handler
})
```
