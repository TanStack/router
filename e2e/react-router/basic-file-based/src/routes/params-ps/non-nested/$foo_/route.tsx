import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/params-ps/non-nested/$foo_')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
