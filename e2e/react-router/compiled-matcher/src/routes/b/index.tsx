import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/b/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/b/"!</div>
}
