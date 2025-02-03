import { RouterProvider } from '@tanstack/react-router'
import { hydrate } from './ssr-client'
import type { AnyRouter } from '@tanstack/react-router'

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.matches.length) {
    hydrate(props.router)
  }

  return <RouterProvider router={props.router} />
}
