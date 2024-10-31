import * as React from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return 'Hello __root!'
}
