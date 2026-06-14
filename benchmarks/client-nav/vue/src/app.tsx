import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { getRouter } from './router'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const app = Vue.createApp({
    render: () => <RouterProvider router={router} />,
  })

  app.mount(container)

  return {
    router,
    unmount() {
      app.unmount()
    },
  }
}
