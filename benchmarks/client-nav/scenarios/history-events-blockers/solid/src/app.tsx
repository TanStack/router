import { render } from 'solid-js/web'
import { RouterProvider } from '@tanstack/solid-router'
import { getRouter } from './router'

export { historyEventsBlockersRuntime } from './runtime'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
