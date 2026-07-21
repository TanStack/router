import * as React from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/bar')({
  component: RouteComponent,
})

function RouteComponent() {
  return 'Hello /api/bar!'
}
