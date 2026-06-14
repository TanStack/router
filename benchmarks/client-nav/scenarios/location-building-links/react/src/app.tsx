import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { patchMissingScrollToGlobal } from '../../shared.ts'
import { getRouter } from './router'

export function mountTestApp(container: HTMLDivElement) {
  const restoreScrollTo = patchMissingScrollToGlobal()
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
      try {
        reactRoot.unmount()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
