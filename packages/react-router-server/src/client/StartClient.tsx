import { RouterProvider } from '@tanstack/react-router'
import * as React from 'react'
import type { AnyRouter } from '@tanstack/react-router'

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.matches.length) {
    props.router.hydrate()
  }

  return <RouterProvider router={props.router} />
}
