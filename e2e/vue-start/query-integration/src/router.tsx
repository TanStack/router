import { QueryClient } from '@tanstack/vue-query'
import { createRouter } from '@tanstack/vue-router'
import { createSsrQueryPlugin } from '@tanstack/vue-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient()
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    plugins: [createSsrQueryPlugin({ queryClient })],
  })
}
