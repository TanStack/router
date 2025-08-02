import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/profile/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/users/profile/settings"!</div>
}
