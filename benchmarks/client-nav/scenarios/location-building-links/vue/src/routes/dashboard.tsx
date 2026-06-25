import { Outlet, createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return <Outlet />
}
