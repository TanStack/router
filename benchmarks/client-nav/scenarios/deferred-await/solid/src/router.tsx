import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import { deferredInitialLocation, deferredRouterPendingMs } from '../../shared'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [deferredInitialLocation],
    }),
    defaultPendingMs: deferredRouterPendingMs,
    defaultPendingMinMs: deferredRouterPendingMs,
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
