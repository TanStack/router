import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
import {
  BOOTSTRAP_INTENT_ITEM_ID,
  BOOTSTRAP_RENDER_REPORT_ID,
  BOOTSTRAP_VIEWPORT_ITEM_ID,
} from './preloading'
import { createRouteTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [
        `/preload?intentItemId=${BOOTSTRAP_INTENT_ITEM_ID}&renderReportId=${BOOTSTRAP_RENDER_REPORT_ID}&viewportItemId=${BOOTSTRAP_VIEWPORT_ITEM_ID}`,
      ],
    }),
    defaultPreloadDelay: 0,
    routeTree: createRouteTree(),
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
