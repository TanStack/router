import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import { preloadingInitialEntry } from './preloading'
import { createRouteTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [preloadingInitialEntry],
    }),
    defaultPreloadDelay: 0,
    routeTree: createRouteTree(),
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
