import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import { subscribersSelectorsInitialLocation } from '../../shared'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [subscribersSelectorsInitialLocation],
    }),
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
