import { RouterProvider } from '@tanstack/solid-router'
import { render } from 'solid-js/web'
import { patchMissingScrollToGlobal } from '../../shared.ts'
import { getRouter } from './router'

export function mountTestApp(container: HTMLDivElement) {
  const restoreScrollTo = patchMissingScrollToGlobal()
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
      try {
        dispose()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
