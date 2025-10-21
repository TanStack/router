import { RouterProvider } from '@tanstack/solid-router'
import { hydrateStart } from '@tanstack/start-client-core/client'
import { hydrate } from 'solid-js/web'
import type { AnyRouter } from '@tanstack/router-core'

export function StartClient(props: { router: AnyRouter }) {
  return <RouterProvider router={props.router} />
}

export function clientHydrate() {
  hydrateStart().then((router) => {
    hydrate(() => <StartClient router={router} />, document)
  })
}
