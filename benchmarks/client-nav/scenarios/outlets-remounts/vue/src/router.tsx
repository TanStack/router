import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
import { outletsRemountsInitialPath } from '../../shared'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [outletsRemountsInitialPath],
    }),
    routeTree,
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
