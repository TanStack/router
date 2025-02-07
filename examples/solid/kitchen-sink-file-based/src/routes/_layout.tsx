import * as React from 'solid-js'
import { Outlet, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/_layout')({
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
