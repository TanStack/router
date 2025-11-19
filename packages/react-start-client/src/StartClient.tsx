import { Await, RouterProvider } from '@tanstack/react-router'

import { hydrateStart } from '@tanstack/start-client-core/client'

import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<AnyRouter> | undefined
export function StartClient() {
  if (!hydrationPromise) {
    hydrationPromise = hydrateStart()
  }

  return (
    <Await
      promise={hydrationPromise}
      children={(router) => <RouterProvider router={router} />}
    />
  )
}
