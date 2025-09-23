import { createRouter } from '@tanstack/react-router'
import {
  createMiddleware,
  createStart,
  createUnsafeMiddleware,
} from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })

  return router
}

const requestMiddleware = createUnsafeMiddleware().server(({ next }) => {
  return next({
    context: {
      fromGlobalReqMiddleware: true,
    },
  })
})

export function getStart() {
  return createStart({
    requestMiddleware: [requestMiddleware],
  })
}

createMiddleware().server(({ next, context }) => {
  context.fromGlobalReqMiddleware
  //      ^?
  return next()
})
