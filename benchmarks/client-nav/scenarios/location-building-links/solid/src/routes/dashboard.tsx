import { Outlet, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return <Outlet />
}
