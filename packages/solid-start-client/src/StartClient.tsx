import { RouterProvider } from '@tanstack/solid-router'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

export function StartClient(props: { router: AnyRouter }): JSX.Element {
  return <RouterProvider router={props.router} />
}
