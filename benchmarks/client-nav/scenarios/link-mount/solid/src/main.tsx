import type { RouterHistory } from '@tanstack/history'
import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { resetLinksVisible } from './linkList'
import { routeTree } from './routeTree.gen'
import type { LinkMountPreload } from '../../shared'

export { setLinksVisible } from './linkList'

export function createTestRouter(
  history: RouterHistory,
  preload: LinkMountPreload = 'default',
) {
  return createRouter({
    routeTree,
    history,
    defaultPreload: preload === 'intent' ? 'intent' : undefined,
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

function mount(
  container: HTMLElement,
  history: RouterHistory,
  preload: LinkMountPreload,
) {
  resetLinksVisible()
  const router = createTestRouter(history, preload)

  const unmount = render(() => <RouterProvider router={router} />, container)

  return {
    router,
    unmount,
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  return mount(container, history, 'default')
}

export function mountIntentTestApp(
  container: HTMLElement,
  history: RouterHistory,
) {
  return mount(container, history, 'intent')
}
