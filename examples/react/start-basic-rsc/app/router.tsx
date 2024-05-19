import { Router } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function createRouter() {
  const router = new Router({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    context: {
      assets: [],
    },
    defaultNotFoundComponent: () => <NotFound />,
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
}
