import { RouterProvider } from '@tanstack/vue-router'
import { createApp } from 'vue'
import { patchMissingScrollToGlobal } from '../../shared.ts'
import { getRouter } from './router'
import type {} from '@tanstack/router-core'

export function mountTestApp(container: HTMLDivElement) {
  const restoreScrollTo = patchMissingScrollToGlobal()
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
      try {
        app.unmount()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
