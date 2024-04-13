import {  Router } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  const router= new Router({
    routeTree,
    defaultPreload: 'intent',
    defaultStaleTime: 1,
    context: {
      assets: [],
    },
    dehydrate: (() => {
      return {
        assets: router.options.context.assets,
      }
    }) as any,
    hydrate: (data) => {
      router.options.context.assets = data.assets
    },
  })
  return router
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