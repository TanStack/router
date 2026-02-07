import { createRouter } from '@tanstack/react-router'
import { createStartContextBridge } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'

export type RouterContext = {
  a: string
  c: string
  shared: string
  static: string
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: {
      static: 'static-value',
    },
    plugins: [
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
