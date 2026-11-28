import type { RouterHistory } from '@tanstack/history'
import * as Vue from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  resetLinkListState()
  const router = createTestRouter(history)

  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })

  app.mount(container)

  return {
    router,
    unmount() {
      app.unmount()
    },
  }
}
