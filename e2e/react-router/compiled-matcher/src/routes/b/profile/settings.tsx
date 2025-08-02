import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/b/profile/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/b/profile/settings"!</div>
}
