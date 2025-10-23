import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/ssr/stream')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/ssr/stream"!</div>
}
