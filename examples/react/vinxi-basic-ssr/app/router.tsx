import { Router } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return new Router({
    routeTree,
    defaultPreload: 'intent',
    context: {
      assets: null as any, // We'll fulfill this later
    },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
