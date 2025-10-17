import { RouterProvider } from '@tanstack/solid-router'
import { createResource, Show, Suspense } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const [resource] = createResource(() => new Promise(r => r(true)))

  return (
    <Suspense>
      <Show when={resource()}>
        {(_) => <RouterProvider router={props.router} />}
      </Show>
    </Suspense >
  )
}