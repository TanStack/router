import { RouterProvider } from '@tanstack/solid-router'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}): JSX.Element {
  return <RouterProvider router={props.router} />
}
