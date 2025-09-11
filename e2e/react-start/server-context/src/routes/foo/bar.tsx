import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/foo/bar')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/foo/bar"!</div>
}
