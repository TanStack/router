import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import {
  historyEventsBlockersHomePath,
  historyEventsBlockersRouterPendingMs,
} from '../../shared.ts'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [historyEventsBlockersHomePath],
    }),
    defaultPendingMs: historyEventsBlockersRouterPendingMs,
    defaultPendingMinMs: historyEventsBlockersRouterPendingMs,
    routeTree,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
