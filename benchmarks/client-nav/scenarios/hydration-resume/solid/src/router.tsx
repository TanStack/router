import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import { routeTree, getHydrationResumeRouteIds } from './routeTree'
import { hydrationResumeRuntime } from './runtime'

export { getHydrationResumeRouteIds }

export function createHydrationResumeRouter(initialEntry: string) {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [initialEntry],
    }),
    routeTree,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    hydrate: (dehydratedData: unknown) => {
      hydrationResumeRuntime.recordCustomHydrate(dehydratedData)
    },
  })
}

export function getRouter() {
  return createHydrationResumeRouter('/hydrate/live/live-contract')
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createHydrationResumeRouter>
  }
}
