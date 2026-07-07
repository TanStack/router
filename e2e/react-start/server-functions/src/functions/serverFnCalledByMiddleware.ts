import { createServerFn } from '@tanstack/react-start'

// This server function lives in its own file and is only ever called from
// within a middleware that lives in yet another file (see
// `src/middleware/serverFnCallingMiddleware.ts`). It is never referenced
// directly from client code or from the route file.
export const serverFnCalledByMiddleware = createServerFn().handler(() => {
  return { message: 'hello from server fn called by middleware', secret: 1234 }
})
