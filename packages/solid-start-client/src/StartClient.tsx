import * as Solid from 'solid-js'
import { RouterProvider } from '@tanstack/solid-router'
import type { AnyRouter } from '@tanstack/router-core'

export function StartClient(props: { router: AnyRouter }) {
  const routerProvider = <RouterProvider router={props.router} />
  Solid.createRenderEffect(
    () => Solid.flatten(routerProvider),
    () => {},
  )
  return routerProvider
}
