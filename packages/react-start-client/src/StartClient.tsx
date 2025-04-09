import { Await, RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/start-client-core'
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<void | Array<Array<void>>> | undefined

export function StartClient(props: { router: AnyRouter }) {
  if (!hydrationPromise) {
    if (!props.router.state.matches.length) {
      hydrationPromise = hydrate(props.router)
    } else {
      hydrationPromise = Promise.resolve()
    }
  }
  return (
    <Await
      promise={hydrationPromise}
      children={() => <RouterProvider router={props.router} />}
    />
  )
}
