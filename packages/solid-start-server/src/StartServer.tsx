import { RouterProvider } from '@tanstack/solid-router'
import { createResource, Show, Suspense } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const [resource] = createResource(() => new Promise(r => r(true)))

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RouterProvider router={props.router} />
      {resource() ? '' : ''}
    </Suspense>
  )
}