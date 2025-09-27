import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/a/profile/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/a/profile/settings"!</div>
}
