// @ts-nocheck
import { RouterProvider } from '@tanstack/solid-router'
import { Show, Suspense } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  return (
    <Suspense>
      <Show when={props.router}>
        <RouterProvider router={props.router} />
      </Show>
    </Suspense>
  )
}
