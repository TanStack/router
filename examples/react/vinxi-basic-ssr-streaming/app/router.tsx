import { createRouter as tsrCR } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return tsrCR({
    routeTree,
    defaultPreload: 'intent',
    defaultStaleTime: 1,
    context: {
      assets: [],
    },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
  interface StaticDataRouteOption {
    baseParent?: boolean
  }

  interface RouterState  {
    statusCode: number
  }
}