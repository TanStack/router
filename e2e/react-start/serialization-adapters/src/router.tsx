import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { carAdapter, fooAdapter } from './data'
import { customErrorAdapter } from './CustomError'

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    serializationAdapters: [fooAdapter, carAdapter, customErrorAdapter],
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
