import { createMemoryHistory, createRouter } from '@tanstack/react-router'
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
