// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'main',
    priority: 10, // render last in main area
    title: 'Admin Panel',
    collapsible: false,
  },
  // Opt-out: only render for admin users
  enabled: ({ context }) => {
    return context.user.role === 'admin'
  },
  loader: async () => {
    const stats = await fetchAdminStats()
    return { stats }
  },
  component: AdminPanelWidget,
})

function AdminPanelWidget() {
  const { stats } = Route.useLoaderData()

  return (
    <div className="admin-panel">
      <div className="admin-stats">
        <div className="stat">
          <span className="stat-value">{stats.pendingApprovals}</span>
          <span className="stat-label">Pending Approvals</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.flaggedContent}</span>
          <span className="stat-label">Flagged Content</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.activeUsers}</span>
          <span className="stat-label">Active Users</span>
        </div>
      </div>
      <div className="admin-actions">
        <button>Review Queue</button>
        <button>User Management</button>
        <button>System Settings</button>
      </div>
    </div>
  )
}

async function fetchAdminStats() {
  return {
    pendingApprovals: 12,
    flaggedContent: 3,
    activeUsers: 847,
  }
}
