import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false,
    defaultErrorComponent: ({ error }) => (
      <main className="page-shell">
        <h1>Benchmark route failed</h1>
        <pre>{error.stack}</pre>
      </main>
    ),
    defaultNotFoundComponent: () => (
      <main className="page-shell">
        <h1>Not found</h1>
      </main>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
