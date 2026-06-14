import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { getRouter } from './router'

export { historyEventsBlockersRuntime } from './runtime'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
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
