import { createApp } from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { getRouter } from './router'

export { getPreloadingCounters, resetPreloadingCounters } from './preloading'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const app = createApp({
    setup() {
      return () => <RouterProvider router={router} />
    },
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
