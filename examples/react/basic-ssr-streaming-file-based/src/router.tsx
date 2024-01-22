import { createRouter as createReactRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'
import SuperJSON from 'superjson'

export function createRouter() {
  return createReactRouter({
    routeTree,
    context: {
      head: '',
    },
    defaultPreload: 'intent',
    transformer: SuperJSON,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
