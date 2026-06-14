import { RouterProvider } from '@tanstack/vue-router'
import { createApp } from 'vue'
import { getRouter } from './router'

export {
  getOutletsRemountsComponentCounters,
  getOutletsRemountsLifecycleCounters,
  resetOutletsRemountsCounters,
} from './outletsRemountsRuntime'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const component = <RouterProvider router={router} />
  const app = createApp({
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
