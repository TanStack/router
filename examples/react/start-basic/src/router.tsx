import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { serovalSerializer } from '@tanstack/react-router'
import { FormDataPlugin, HeadersPlugin } from 'seroval-plugins/web'
import { createServerFn, createStart } from '@tanstack/react-start'

const fn = createServerFn().handler(() => {
  return {
    formData: new FormData(),
    headers: new Headers(),
  }
})

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })

  return router
}

const start = createStart({
  serializer: serovalSerializer({ plugins: [FormDataPlugin, HeadersPlugin] }),
})

declare module '@tanstack/react-start' {
  interface Register {
    start: typeof start
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
