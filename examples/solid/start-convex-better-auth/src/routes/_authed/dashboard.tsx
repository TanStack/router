import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/_authed/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/dashboard"!</div>
}
