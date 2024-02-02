import { createRouter as baseCreateRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export type RootRouterContext = {
  headTags?: () => React.ReactNode
  bodyTags?: () => React.ReactNode
}

export const createRouter = (opts: { context?: RootRouterContext } = {}) => {
  return baseCreateRouter({ routeTree, defaultPreload: 'intent', ...opts })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
