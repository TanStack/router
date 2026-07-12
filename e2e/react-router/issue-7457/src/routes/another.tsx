import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/another')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/another"!</div>
}
