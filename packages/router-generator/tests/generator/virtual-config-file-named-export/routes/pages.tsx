import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$lang/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/$lang/"!</div>
}
