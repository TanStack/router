import type { RegisteredLoaderClient } from '@tanstack/react-loaders'
import { ReactRouter } from '@tanstack/react-router'
import { loaderClient } from './loaderClient'
import { routeTree } from './routeTree'

export interface RouterContext {
  loaderClient: RegisteredLoaderClient
}

export const router = new ReactRouter({
  routeTree,
  context: {
    loaderClient,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
