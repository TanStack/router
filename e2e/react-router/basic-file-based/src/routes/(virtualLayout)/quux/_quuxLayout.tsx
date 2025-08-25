import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(virtualLayout)/quux/_quuxLayout')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <Outlet />
    </div>
  )
}
