import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

export function createTestRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultStructuralSharing: true,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement) {
  const router = createTestRouter()

  const unmount = render(() => <RouterProvider router={router} />, container)

  return {
    router,
    unmount,
  }
}
