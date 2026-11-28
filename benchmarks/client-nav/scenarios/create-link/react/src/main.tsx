import type { RouterHistory } from '@tanstack/history'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { resetLinkListState } from './linkList'
import { routeTree } from './routeTree.gen'

export { setLinkListState } from './linkList'

export function createTestRouter(history: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    scrollRestoration: true,
    // Key the scroll-restoration cache by pathname instead of the default
    // random per-entry location key, so the cache stays bounded.
    getScrollRestorationKey: (location) => location.pathname,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  resetLinkListState()
  const router = createTestRouter(history)

  const reactRoot = createRoot(container)
  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      reactRoot.unmount()
    },
  }
}
