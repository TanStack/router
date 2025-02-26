import { Await, RouterProvider } from '@tanstack/react-router'
import { hydrate } from './ssr-client'
import type { AnyRouter } from '@tanstack/react-router'

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
