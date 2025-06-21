import { Await, RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/router-core-ssr/client'
import type { AnyRouter } from '@tanstack/router-core'
import type { ReactNode } from 'react'

let hydrationPromise: Promise<void | Array<Array<void>>> | undefined

export function RouterClient(props: { router: AnyRouter, children?: ReactNode }) {
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
      children={() => props.children ?? <RouterProvider router={props.router} />}
    />
  )
}
