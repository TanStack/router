import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nest/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Nest</div>
}
