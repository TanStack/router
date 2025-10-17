import { RouterProvider } from '@tanstack/solid-router'
import { createResource, Show, Suspense } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  return (
    <RouterProvider router={props.router} />
  )
}