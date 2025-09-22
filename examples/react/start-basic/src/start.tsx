import { createMiddleware, createStart } from '@tanstack/react-start'

import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        fromFetch: boolean
      }
    }
  }
}

// @manuel
export const serverMw = createMiddleware().server(({ next, context }) => {
  context.fromFetch
  //      ^?

  return next({
    context: {
      fromServerMw: true,
    },
  })
})

export const fnMw = createMiddleware({ type: 'function' })
  .middleware([serverMw])
  .server(({ next, context }) => {
    context.fromFetch
    //      ^?

    return next({
      context: {
        fromFnMw: true,
      },
    })
  })

export const startInstance = createStart(() => {
  return {
    serializationAdapters: [],
    requestMiddleware: [serverMw],
    functionMiddleware: [fnMw],
  }
})

startInstance.createMiddleware().server(({ next, context }) => {
  context.fromFetch
  //      ^?
  context.fromServerMw
  //      ^?

  return next({
    context: {
      fromStartInstanceMw: true,
    },
  })
})

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
}
