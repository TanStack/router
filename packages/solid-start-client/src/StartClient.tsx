import { Suspense } from 'solid-js';
import { Await, RouterProvider } from '@tanstack/solid-router'
import { hydrateStart } from '@tanstack/start-client-core/client';
import type { AnyRouter } from '@tanstack/router-core'

export function StartClient({ router }: { router: AnyRouter }) {
  return (
    <RouterProvider router={router} />
  )
}
