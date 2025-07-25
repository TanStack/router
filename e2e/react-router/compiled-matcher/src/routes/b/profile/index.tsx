import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/b/profile/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/b/profile/"!</div>
}
