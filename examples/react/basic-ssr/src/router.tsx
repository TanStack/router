import { createReactRouter } from '@tanstack/react-router'
import { routeConfig } from './routeConfig'

export const createRouter = () =>
  createReactRouter({
    routeConfig,
    // defaultPreload: 'intent',
  })

declare module '@tanstack/react-router' {
  interface RegisterRouter {
    router: ReturnType<typeof createRouter>
  }
}
