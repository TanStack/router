import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$subdomain/test')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/$subdomain/test"!</div>
}
