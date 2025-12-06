import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/대한민국')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/대한민국"!</div>
}
