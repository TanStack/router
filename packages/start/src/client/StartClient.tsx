import { RouterProvider } from '@tanstack/react-router'
import { afterHydrate } from './serialization'
import type { AnyRouter } from '@tanstack/react-router'

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.matches.length) {
    props.router.hydrate()
    afterHydrate({ router: props.router })
  }

  return <RouterProvider router={props.router} />
}
