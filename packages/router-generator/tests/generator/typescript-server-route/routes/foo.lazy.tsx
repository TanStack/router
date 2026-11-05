import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/foo')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/foo"!</div>
}
