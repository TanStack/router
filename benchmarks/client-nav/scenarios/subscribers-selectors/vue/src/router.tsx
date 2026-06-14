import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
