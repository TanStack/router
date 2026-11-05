import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/bar')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/api/bar"!</div>
}
