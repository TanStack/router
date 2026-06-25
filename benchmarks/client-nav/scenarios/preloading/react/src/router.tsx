import { createMemoryHistory, createRouter } from '@tanstack/react-router'
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
