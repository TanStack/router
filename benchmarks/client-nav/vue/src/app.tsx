import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { getRouter } from './router'

export function mountTestApp(container: Element) {
  const router = getRouter()
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
