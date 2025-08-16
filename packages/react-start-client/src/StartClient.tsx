import { Await, RouterProvider } from '@tanstack/react-router'
import { hydrateStart } from '@tanstack/start-client-core'
import type { CreateStart } from '@tanstack/start-client-core'
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<AnyRouter> | undefined

export function StartClient({ createStart }: { createStart: CreateStart }) {
  if (!hydrationPromise) {
    hydrationPromise = hydrateStart(createStart)
  }
  return (
    <Await
      promise={hydrationPromise}
      children={(router) => <RouterProvider router={router} />}
    />
  )
}
