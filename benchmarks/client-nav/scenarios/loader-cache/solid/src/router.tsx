import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import { loaderCacheInitialEntry } from '../../shared.ts'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [loaderCacheInitialEntry],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
