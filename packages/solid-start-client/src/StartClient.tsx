import { Await, RouterProvider } from '@tanstack/solid-router'
import { hydrate } from '@tanstack/start-client-core'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

let hydrationPromise: Promise<void | Array<Array<void>>> | undefined

const Dummy = (props: { children?: JSXElement }) => <>{props.children}</>

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
