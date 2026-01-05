// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link } from '@tanstack/react-router'

// Header is explicitly placed, not part of iteration
// No meta.area needed since it's rendered via <Route.SlotOutlet name="header" />
export const Route = createSlotRoute({
  path: '/',
  // No defaultOpen needed - slots render by default!
  loader: async ({ context }) => {
    const user = context.user
    const notifications = await fetchUnreadCount(user.id)
    return { user, notifications }
  },
  component: DashboardHeader,
})

function DashboardHeader() {
  const { user, notifications } = Route.useLoaderData()

  return (
    <div className="dashboard-header">
      <h1>Dashboard</h1>
      <nav>
        <Link to="/dashboard">Overview</Link>
        <Link to="/dashboard/analytics">Analytics</Link>
        <Link to="/dashboard/reports">Reports</Link>
      </nav>
      <div className="header-actions">
        <button className="notifications-btn">
          🔔{' '}
          {notifications > 0 && <span className="badge">{notifications}</span>}
        </button>
        <span className="user-name">{user.name}</span>
      </div>
    </div>
  )
}

async function fetchUnreadCount(userId: string) {
  return 5
}
