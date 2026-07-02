import { RouterProvider, createRouter } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'

export function createTestRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement) {
  const router = createTestRouter()

  const reactRoot = createRoot(container)
  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      reactRoot.unmount()
    },
  }
}
