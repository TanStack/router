import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { getRouter } from './router'

export function mountTestApp(container: HTMLDivElement) {
  const router = getRouter()
  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
