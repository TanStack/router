import * as Vue from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

export function createTestRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement) {
  const router = createTestRouter()

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
