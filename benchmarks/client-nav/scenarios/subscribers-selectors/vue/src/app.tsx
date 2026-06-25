import { RouterProvider } from '@tanstack/vue-router'
import { createApp } from 'vue'
import { getRouter } from './router'

export {
  getSubscriberCounts,
  resetSubscriberCounts,
  setSubscriberCountersEnabled,
} from './subscriberRuntime'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const app = createApp({
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
