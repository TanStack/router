import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/beep/boop')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/beep/boop"!</div>
}
