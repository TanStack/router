// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'sidebar',
    priority: 1,
  },
  // No loader needed - static content
  component: QuickActionsWidget,
})

function QuickActionsWidget() {
  return (
    <div className="quick-actions">
      <h4>Quick Actions</h4>
      <div className="action-buttons">
        <button className="action-btn">
          <span className="action-icon">➕</span>
          <span>New Project</span>
        </button>
        <button className="action-btn">
          <span className="action-icon">📝</span>
          <span>Create Task</span>
        </button>
        <button className="action-btn">
          <span className="action-icon">👥</span>
          <span>Invite Team</span>
        </button>
        <button className="action-btn">
          <span className="action-icon">📊</span>
          <span>Run Report</span>
        </button>
      </div>
    </div>
  )
}
