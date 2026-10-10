// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, Link } from '@tanstack/react-router'

// Metrics widget root
export const Route = createSlotRootRoute({
  component: MetricsWidget,
})

function MetricsWidget() {
  return (
    <div className="widget metrics-widget">
      <header className="widget-header">
        <h2>Metrics</h2>
        <nav>
          <Link slot="metrics" to="/">
            Overview
          </Link>
          <Link slot="metrics" to="/revenue">
            Revenue
          </Link>
          <Link slot="metrics" to="/users">
            Users
          </Link>
        </nav>
      </header>
      <div className="widget-content">
        <Outlet />
      </div>
    </div>
  )
}
