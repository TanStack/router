import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/z/y/x/v')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/z/y/x/v"!</div>
}
