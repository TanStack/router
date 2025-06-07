import * as React from 'react'

export const Route = createFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return 'Hello /api/bar!'
}
