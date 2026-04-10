import * as React from 'react'
import { RouterProvider } from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/router-core'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}): React.JSX.Element {
  return <RouterProvider router={props.router} />
}
