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
  onRouteChange: () => {
    if (typeof window === 'undefined') return

    const titleMatch = [...router.state.currentMatches]
      .reverse()
      .find((d) => d.routeContext?.getTitle)

    const title = titleMatch?.context?.getTitle?.() ?? 'Astro + TanStack Router'

    document.title = title
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
