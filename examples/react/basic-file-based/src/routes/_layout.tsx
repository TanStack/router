import * as React from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout')({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div>
      <div>I'm a layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
