// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Link } from '@tanstack/react-router'

// Quick actions widget - single route, no internal navigation
export const Route = createSlotRootRoute({
  loader: async () => {
    const actions = await fetchQuickActions()
    return { actions }
  },
  component: QuickActionsWidget,
})

function QuickActionsWidget() {
  const { actions } = Route.useLoaderData()

  return (
    <div className="widget quick-actions-widget">
      <header className="widget-header">
        <h2>Quick Actions</h2>
      </header>
      <div className="widget-content">
        <div className="action-buttons">
          {actions.map((action) => (
            <button key={action.id} className="action-button">
              <span className="action-icon">{action.icon}</span>
              <span className="action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

async function fetchQuickActions() {
  return [
    { id: '1', icon: '➕', label: 'New Project' },
    { id: '2', icon: '👤', label: 'Invite User' },
    { id: '3', icon: '📊', label: 'Generate Report' },
  ]
}
