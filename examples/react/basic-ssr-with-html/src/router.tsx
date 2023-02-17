import { RegisteredLoaderClient } from '@tanstack/react-loaders'
import { Router } from '@tanstack/router'
import { loaderClient } from './loaderClient'
import { routeTree } from './routeTree'

export interface RouterContext {
  loaderClient: RegisteredLoaderClient
}

export const router = new Router({
  routeTree,
  context: {
    loaderClient,
  },
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}
