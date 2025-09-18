import { createRouter, createRouterConfig } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { carAdapter, fooAdapter } from './data'
import { customErrorAdapter } from './CustomError'

const config = createRouterConfig({
  serializationAdapters: [fooAdapter, carAdapter, customErrorAdapter],
})

export function getRouter() {
  const router = createRouter({
    ...config,
    routeTree,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    config: typeof config
    router: ReturnType<typeof getRouter>
  }
}
