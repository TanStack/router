import * as React from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout')({
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
