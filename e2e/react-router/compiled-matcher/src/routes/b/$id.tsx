import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/b/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/b/$id"!</div>
}
