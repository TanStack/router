import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { getRouter } from './router'

export function mountTestApp(container: HTMLDivElement) {
  const router = getRouter()
  const app = Vue.createApp({
    render: () => <RouterProvider router={router} />,
  })
  let didUnmount = false

  app.mount(container)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
