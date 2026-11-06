// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'main',
    priority: 2,
    title: 'Key Metrics',
    collapsible: true,
  },
  loader: async () => {
    const metrics = await fetchMetrics()
    return { metrics }
  },
  component: MetricsWidget,
})

function MetricsWidget() {
  const { metrics } = Route.useLoaderData()

  return (
    <div className="metrics-grid">
      {metrics.map((metric) => (
        <div key={metric.label} className="metric-card">
          <span className="metric-value">{metric.value}</span>
          <span className="metric-label">{metric.label}</span>
          <span
            className={`metric-change ${metric.change > 0 ? 'positive' : 'negative'}`}
          >
            {metric.change > 0 ? '↑' : '↓'} {Math.abs(metric.change)}%
          </span>
        </div>
      ))}
    </div>
  )
}

async function fetchMetrics() {
  return [
    { label: 'Revenue', value: '$12,345', change: 12 },
    { label: 'Users', value: '1,234', change: 8 },
    { label: 'Orders', value: '567', change: -3 },
    { label: 'Conversion', value: '4.2%', change: 5 },
  ]
}
