import { AnyRouter } from '@tanstack/router-core'

export let currentHandlers: Record<string, any> = {}

function makeFakeRouter(): AnyRouter {
  return {
    rewrite: undefined as any,
    getMatchedRoutes: (_pathname: string) => ({
      matchedRoutes: [{ options: { server: { middleware: [] } } }],
      foundRoute: {
        options: {
          server: { handlers: currentHandlers },
          component: undefined, 
        },
      },
      routeParams: {},
    }),
    
    update: () => {},
    load: async () => {},
    state: { redirect: null } as any,
    serverSsr: { dehydrate: async () => {} } as any,
    options: {} as any,
    resolveRedirect: (r: any) => r,
  } as unknown as AnyRouter
}

export async function getRouter() {
  return makeFakeRouter()
}