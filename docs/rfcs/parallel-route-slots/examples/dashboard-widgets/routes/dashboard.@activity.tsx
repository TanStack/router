// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, Link } from '@tanstack/react-router'

// Activity widget root - wraps all activity views
export const Route = createSlotRootRoute({
  component: ActivityWidget,
})

function ActivityWidget() {
  return (
    <div className="widget activity-widget">
      <header className="widget-header">
        <h2>Activity</h2>
        <nav>
          <Link slot="activity" to="/">
            All
          </Link>
          <Link slot="activity" to="/recent">
            Recent
          </Link>
        </nav>
      </header>
      <div className="widget-content">
        <Outlet />
      </div>
    </div>
  )
}
