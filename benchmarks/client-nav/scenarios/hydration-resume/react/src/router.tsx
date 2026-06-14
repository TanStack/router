import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import {
  hydrationResumeRouterPendingMs,
  hydrationResumeStandaloneInitialEntry,
} from '../../shared.ts'
import { routeTree, getHydrationResumeRouteIds } from './routeTree'
import { hydrationResumeRuntime } from './runtime'

export { getHydrationResumeRouteIds }

export function createHydrationResumeRouter(initialEntry: string) {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [initialEntry],
    }),
    routeTree,
    defaultPendingMs: hydrationResumeRouterPendingMs,
    defaultPendingMinMs: hydrationResumeRouterPendingMs,
    hydrate: (dehydratedData: unknown) => {
      hydrationResumeRuntime.recordCustomHydrate(dehydratedData)
    },
  })
}

export function getRouter() {
  return createHydrationResumeRouter(hydrationResumeStandaloneInitialEntry)
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createHydrationResumeRouter>
  }
}
