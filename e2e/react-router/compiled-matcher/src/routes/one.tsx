import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/one')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/one"!</div>
}
