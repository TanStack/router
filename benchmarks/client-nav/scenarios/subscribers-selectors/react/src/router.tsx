import { createMemoryHistory, createRouter } from '@tanstack/react-router'
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
