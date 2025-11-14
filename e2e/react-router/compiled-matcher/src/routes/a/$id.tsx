import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/a/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/a/$id"!</div>
}
