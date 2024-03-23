import { AnyRouter, RouterProvider } from '@tanstack/react-router'
import * as React from 'react'

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.lastUpdated) {
    props.router.hydrate()
  }

  return <RouterProvider router={props.router} />
}
