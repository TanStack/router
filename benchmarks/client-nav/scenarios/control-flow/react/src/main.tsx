import { RouterProvider, createRouter } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'

export function createTestRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement) {
  const router = createTestRouter()

  // The scenario intentionally throws loader errors every lap; keep React 19's
  // default per-caught-error console reporting out of the measured loop.
  const reactRoot = createRoot(container, { onCaughtError: () => {} })
  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      reactRoot.unmount()
    },
  }
}
