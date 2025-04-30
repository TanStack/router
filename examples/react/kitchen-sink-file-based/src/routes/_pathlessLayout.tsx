import * as React from 'react'
import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <div>
      <div>Pathless Layout</div>
      <hr />
      <Outlet />
    </div>
  )
}
