import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
import { INITIAL_CONTROL_FLOW_PATH } from '../../shared'
import { errorRoute } from './routes/error'
import { fallbackRoute } from './routes/fallback'
import { notFoundRoute } from './routes/not-found'
import { redirectBeforeLoadRoute } from './routes/redirect-before-load'
import { redirectLoaderRoute } from './routes/redirect-loader'
import { rootRoute } from './routes/__root'
import { searchRoute } from './routes/search'
import { startRoute } from './routes/start'
import { targetRoute } from './routes/target'

const routeTree = rootRoute.addChildren([
  startRoute,
  targetRoute,
  redirectBeforeLoadRoute,
  redirectLoaderRoute,
  notFoundRoute,
  errorRoute,
  searchRoute,
  fallbackRoute,
])

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [INITIAL_CONTROL_FLOW_PATH],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree,
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
