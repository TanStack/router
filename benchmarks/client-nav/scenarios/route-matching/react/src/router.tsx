import { createMemoryHistory, createRouter } from '@tanstack/react-router'
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
