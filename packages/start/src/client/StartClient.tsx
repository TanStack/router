import { RouterProvider } from '@tanstack/react-router'
import { defaultTransformer } from './defaultTransformer'
import { afterHydrate } from './serialization'
import type { AnyRouter } from '@tanstack/react-router'

let cleaned = false

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.matches.length) {
    props.router.options.transformer =
      (props.router.options as any).transformer || defaultTransformer

    props.router.hydrate()
    afterHydrate({ router: props.router })
  }

  if (!cleaned) {
    cleaned = true
    window.__TSR__?.cleanScripts()
  }

  return <RouterProvider router={props.router} />
}
