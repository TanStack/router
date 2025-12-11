import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

/**
 * Create and return a configured TanStack React Router instance for the application.
 *
 * @returns A router configured with the application's `routeTree`, intent preloading, `DefaultCatchBoundary` as the default error component, `NotFound` as the default not-found component, and scroll restoration enabled.
 */
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