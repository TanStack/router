import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/ssr/nested')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/ssr/nested"!</div>
}
