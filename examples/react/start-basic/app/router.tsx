import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { registerGlobalMiddleware } from '@tanstack/start'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { randomMiddleware } from './utils/randomMiddleware'

// The function that creates the router
export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
  })

  return router
}

// Add global middleware for all middleware and server functions
const _globalMiddleware = registerGlobalMiddleware({
  middleware: [randomMiddleware],
})

// Register type safety
declare module '@tanstack/start' {
  interface Register {
    router: ReturnType<typeof createRouter>
    globalMiddleware: typeof _globalMiddleware
  }
}
