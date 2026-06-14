import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
import { INITIAL_ROUTE_PATH } from '../../shared'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [INITIAL_ROUTE_PATH],
    }),
    pathParamsAllowedCharacters: ['@', ':'],
    routeTree: routeTree as any,
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
