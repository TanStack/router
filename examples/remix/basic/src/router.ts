import { createRouter } from '@tanstack/remix-router'
import { routeTree } from './routeTree.gen'

/**
 * Factory invoked once per request server-side, and once on the client.
 * The Start vite plugin imports this via the `#tanstack-router-entry`
 * virtual module — exporting `getRouter` is the convention.
 */
export function getRouter() {
  return createRouter({ routeTree })
}

export type AppRouter = ReturnType<typeof getRouter>
