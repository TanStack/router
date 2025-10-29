import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/a/$')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/a/$"!</div>
}
