import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createHydrationResumeRouter>
  }
}
