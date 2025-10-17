import { createResource, Suspense } from 'solid-js';
import { Await, RouterProvider } from '@tanstack/solid-router'
import { hydrateStart } from '@tanstack/start-client-core/client';
import type { AnyRouter } from '@tanstack/router-core'

export function StartClient({ router }: { router: AnyRouter }) {
  const [resource] = createResource(() => new Promise(r => r(hydrateStart())))

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RouterProvider router={router} />
      {resource() ? '' : ''}
    </Suspense>
  )
}
