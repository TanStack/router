---
name: Server functions
description: Define and call server-only logic with createServerFn.
version: 1
source: docs/start/framework/react/guide/server-functions.md
---

# Server functions

## Summary

- Use `createServerFn` to define server-only logic callable from client or loaders.
- Provide `method` and `inputValidator` for runtime validation.
- Client calls are compiled to RPC fetches; server code is not bundled.

## Usage notes

- Use `useServerFn` in components or call from loaders.
- Static imports are safe; avoid dynamic imports.
- Redirects, notFound, and errors propagate across the boundary.

## Use cases

- Call server-only logic from the client
- Validate inputs on the server
- Access secrets without client exposure

## Notes

- Avoid dynamic imports; bundler replaces calls with RPC stubs.
- Use `.server.ts` for server-only helpers.

## Examples

```ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

export const updateUser = createServerFn({
  method: 'POST',
  inputValidator: z.object({ id: z.string(), name: z.string() }),
}).handler(async ({ input }) => {
  return db.user.update(input)
})
```

## Utilities

- `getRequest`, `getRequestHeader`, `setResponseHeaders`, `setResponseStatus`.
