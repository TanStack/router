import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$id/foo/bar')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/$id/foo/bar"!</div>
}
