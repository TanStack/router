import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [{ title: 'Dashboard' }],
  }),
  component: Dashboard,
})

function Dashboard() {
  return (
    <main data-testid="dashboard">
      <h1>Dashboard</h1>
    </main>
  )
}
