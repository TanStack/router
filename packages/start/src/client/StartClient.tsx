import {
  RouterContextProvider,
  RouterProvider,
  rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { ClientMeta } from './Meta'
import type { AnyRouter, RootRouteOptions } from '@tanstack/react-router'

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.matches.length) {
    props.router.hydrate()
  }

  const ShellComponent = (
    props.router.looseRoutesById[rootRouteId]?.options as RootRouteOptions
  ).shellComponent

  return (
    <RouterContextProvider router={props.router}>
      {ShellComponent ? <ClientMeta /> : null}
      <RouterProvider router={props.router} />
    </RouterContextProvider>
  )
}
