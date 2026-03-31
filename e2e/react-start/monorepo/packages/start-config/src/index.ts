// Shared start configuration for the monorepo.
// This simulates an external package that defines createStart() with
// global request middleware, then exports the startInstance so that
// other packages can use startInstance.createServerFn / startInstance.createMiddleware
// to get fully-typed context WITHOUT needing access to the app's routeTree.gen.ts.

import { createMiddleware, createStart } from '@tanstack/react-start'

export const localeMiddleware = createMiddleware({ type: 'request' }).server(
  ({ next }) => {
    return next({
      context: {
        locale: 'en-us' as string,
      },
    })
  },
)

export const authMiddleware = createMiddleware({ type: 'request' }).server(
  ({ next }) => {
    return next({
      context: {
        userId: 'user-42' as string,
      },
    })
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [localeMiddleware, authMiddleware],
}))
