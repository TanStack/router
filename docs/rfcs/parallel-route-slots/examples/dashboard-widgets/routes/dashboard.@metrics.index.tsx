// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

// Metrics overview
export const Route = createSlotRoute({
  path: '/',
  loader: async () => {
    const overview = await fetchMetricsOverview()
    return { overview }
  },
  component: MetricsOverview,
})

function MetricsOverview() {
  const { overview } = Route.useLoaderData()

  return (
    <div className="metrics-overview">
      <div className="metric">
        <span className="metric-value">{overview.revenue}</span>
        <span className="metric-label">Revenue</span>
      </div>
      <div className="metric">
        <span className="metric-value">{overview.users}</span>
        <span className="metric-label">Users</span>
      </div>
      <div className="metric">
        <span className="metric-value">{overview.orders}</span>
        <span className="metric-label">Orders</span>
      </div>
    </div>
  )
}

async function fetchMetricsOverview() {
  return { revenue: '$12,345', users: '1,234', orders: '567' }
}
