import { createRouter } from '@tanstack/react-router'
import { createStartContextBridge } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'

export type RouterContext = {
  a: string
  c: string
  shared: string
  static: string
}

const startContextBridge = createStartContextBridge({
  select: (ctx) => ({
    a: ctx.a,
    c: ctx.c,
    shared: ctx.shared,
  }),
})

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: {
      ...startContextBridge.get(),
      static: 'static-value',
    },
  })

  startContextBridge.setup(router)

  return router
}
