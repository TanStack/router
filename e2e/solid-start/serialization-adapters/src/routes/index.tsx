import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/"!</div>
}
