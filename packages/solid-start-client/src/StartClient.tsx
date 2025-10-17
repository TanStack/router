import { Suspense } from 'solid-js';
import { Await, RouterProvider } from '@tanstack/solid-router'
import { hydrateStart } from '@tanstack/start-client-core/client';
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<AnyRouter> | undefined

export function StartClient({ router }: { router: AnyRouter }) {
  if (!hydrationPromise) {
    hydrationPromise = hydrateStart()
  }
  return (
    <Suspense>
      <Await
        promise={hydrationPromise}
        children={(data) => <RouterProvider router={data} />}
      />
    </Suspense>
  )
}
