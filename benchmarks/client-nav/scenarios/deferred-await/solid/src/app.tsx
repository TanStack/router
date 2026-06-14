import { RouterProvider } from '@tanstack/solid-router'
import { render } from 'solid-js/web'
import { getRouter } from './router'

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

export {
  getDeferredRegistrySnapshot,
  resetDeferredRegistry,
  resolveDeferredKey,
  resolveReportDeferredKeys,
} from '../../shared'
