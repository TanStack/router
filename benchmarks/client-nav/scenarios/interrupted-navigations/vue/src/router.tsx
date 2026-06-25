import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
import { interruptedNavigationHomePath } from '../../shared.ts'
import { fastRoute } from './routes/fast'
import { interruptRoute } from './routes/interrupt'
import { nestedChildRoute } from './routes/nested-child'
import { nestedParentRoute } from './routes/nested-parent'
import { rootRoute } from './routes/__root'
import { slowRoute } from './routes/slow'

const routeTree = rootRoute.addChildren([
  interruptRoute.addChildren([
    slowRoute,
    fastRoute,
    nestedParentRoute.addChildren([nestedChildRoute]),
  ]),
])

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [interruptedNavigationHomePath],
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
