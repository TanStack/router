import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/a/user-{$id}')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>{'Hello "/a/user-{$id}"!'}</div>
}
