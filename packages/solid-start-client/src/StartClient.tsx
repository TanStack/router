import { Show, Suspense } from 'solid-js'
import { RouterProvider } from '@tanstack/solid-router'
import type { AnyRouter } from '@tanstack/router-core'

export function StartClient(props: { router: AnyRouter }) {
  return (
    <Suspense>
      <Show when={props.router}>
        <RouterProvider router={props.router} />
      </Show>
    </Suspense>
  )
}
