import { Router } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export function createRouter() {
  return new Router({
    routeTree,
    context: {
      head: '',
    },
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
