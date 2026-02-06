import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { createSsrQueryPlugin } from '@tanstack/react-router-ssr-query'
import { createStartContextBridge } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'

export type RouterContext = {
  a: string
  c: string
  shared: string
  static: string
  queryClient: QueryClient
}

export function getRouter() {
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: {
      static: 'static-value',
    },
    plugins: [
      createSsrQueryPlugin({ queryClient }),
      createStartContextBridge({
        select: (ctx) => ({
          a: ctx.a,
          c: ctx.c,
          shared: ctx.shared,
        }),
      }),
    ],
  })
}
