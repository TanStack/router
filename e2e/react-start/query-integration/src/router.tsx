import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { createSsrQueryPlugin } from '@tanstack/react-router-ssr-query'
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
