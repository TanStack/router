// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createFileRoute, Outlet } from '@tanstack/react-router'

// Slots are NOT declared here - they're discovered from dashboard.@*.tsx files
// after composition. Route.Outlet gains type-safe slot prop automatically.
export const Route = createFileRoute('/dashboard')({
  loader: async () => {
    // Dashboard-level data (user info, permissions, etc.)
    const user = await fetchCurrentUser()
    return { user }
  },
  component: Dashboard,
})

function Dashboard() {
  const { user } = Route.useLoaderData()

  return (
    <div className="dashboard">
      <h1>Welcome back, {user.name}</h1>

      <div className="dashboard-grid">
        {/* Left column - Activity feed */}
        <aside className="dashboard-sidebar">
          <Route.Outlet slot="activity" />
        </aside>

        {/* Main content area */}
        <main className="dashboard-main">
          <Outlet />
        </main>

        {/* Right column - Metrics and Quick Actions */}
        <aside className="dashboard-sidebar">
          <Route.Outlet slot="metrics" />
          <Route.Outlet slot="quickActions" />
        </aside>
      </div>
    </div>
  )
}

async function fetchCurrentUser() {
  return { id: '1', name: 'Jane' }
}
