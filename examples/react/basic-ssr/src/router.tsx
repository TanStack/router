import { ReactRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree'

export const router = new ReactRouter({
  // routeTree,
  context: {
    head: '',
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
