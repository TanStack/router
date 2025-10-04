import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$id/bar/foo')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/$id/bar/foo"!</div>
}
