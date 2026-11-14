import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { locale: 'en' },
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
