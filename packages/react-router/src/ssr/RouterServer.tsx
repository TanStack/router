import * as React from 'react'
import { RouterProvider } from '../RouterProvider'
import type { AnyRouter } from '@tanstack/router-core'

export function RouterServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}): React.JSX.Element {
  return <RouterProvider router={props.router} />
}
