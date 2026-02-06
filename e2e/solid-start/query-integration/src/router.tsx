import { QueryClient } from '@tanstack/solid-query'
import { createRouter } from '@tanstack/solid-router'
import { createSsrQueryPlugin } from '@tanstack/solid-router-ssr-query'
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
