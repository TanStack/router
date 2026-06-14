import { RouterProvider } from '@tanstack/vue-router'
import { createApp } from 'vue'
import { patchMissingScrollToGlobal } from '../../shared.ts'
import { getRouter } from './router'

export function mountTestApp(container: HTMLDivElement) {
  const restoreScrollTo = patchMissingScrollToGlobal()
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
      try {
        app.unmount()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
