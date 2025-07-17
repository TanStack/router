import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nest/foo')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>nest/foo</div>
}
