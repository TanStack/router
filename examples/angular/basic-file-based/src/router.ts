import { createRouter } from '@tanstack/angular-router-experimental'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/angular-router-experimental' {
  interface Register {
    router: typeof router
  }
}
