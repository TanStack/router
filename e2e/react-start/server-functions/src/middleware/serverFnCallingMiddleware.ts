import { createMiddleware } from '@tanstack/react-start'
import { serverFnCalledByMiddleware } from '~/functions/serverFnCalledByMiddleware'

// This middleware lives in its own file and, from its `.server()` handler,
// calls a server function that is defined in a *separate* file.
//
// Regression test for https://github.com/TanStack/router/issues/7213:
// when this middleware is applied to a server function, production builds
// used to fail at runtime with "Server function info not found for [ID]"
// because the server function reached only through the middleware was not
// registered in the server function manifest. Dev builds worked fine.
export const serverFnCallingMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const result = await serverFnCalledByMiddleware()

  return next({
    context: {
      fromMiddleware: result,
    },
  })
})
