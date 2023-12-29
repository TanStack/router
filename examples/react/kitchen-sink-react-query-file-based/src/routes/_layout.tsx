import * as React from 'react'
import { Link, Outlet, FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute("/_layout").createRoute({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div>
      <div>Layout</div>
      <hr />
      <Outlet />
    </div>
  )
}
