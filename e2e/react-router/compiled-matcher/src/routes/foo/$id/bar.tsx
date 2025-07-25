import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/foo/$id/bar')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/foo/$id/bar"!</div>
}
