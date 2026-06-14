import { RouterProvider } from '@tanstack/solid-router'
import { render } from 'solid-js/web'
import { getRouter } from './router'

export function mountTestApp(container: Element) {
  const router = getRouter()
  const unmount = render(() => <RouterProvider router={router} />, container)

  return {
    router,
    unmount,
  }
}
