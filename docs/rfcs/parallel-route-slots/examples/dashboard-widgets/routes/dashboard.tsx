// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  // Define route-scoped slots for dashboard widgets
  slots: {
    activity: true, // auto-wired from dashboard.@activity.tsx
    metrics: true, // auto-wired from dashboard.@metrics.tsx
    quickActions: true, // auto-wired from dashboard.@quickActions.tsx
  },
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
          <Route.SlotOutlet name="activity" />
        </aside>

        {/* Main content area */}
        <main className="dashboard-main">
          <Outlet />
        </main>

        {/* Right column - Metrics and Quick Actions */}
        <aside className="dashboard-sidebar">
          <Route.SlotOutlet name="metrics" />
          <Route.SlotOutlet name="quickActions" />
        </aside>
      </div>
    </div>
  )
}

async function fetchCurrentUser() {
  return { id: '1', name: 'Jane' }
}
