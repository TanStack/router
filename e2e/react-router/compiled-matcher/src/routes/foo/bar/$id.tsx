import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/foo/bar/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/foo/bar/$id"!</div>
}
