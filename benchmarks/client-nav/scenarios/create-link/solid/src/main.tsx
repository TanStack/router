import type { RouterHistory } from '@tanstack/history'
import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
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

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  resetLinkListState()
  const router = createTestRouter(history)

  const unmount = render(() => <RouterProvider router={router} />, container)

  return {
    router,
    unmount,
  }
}
