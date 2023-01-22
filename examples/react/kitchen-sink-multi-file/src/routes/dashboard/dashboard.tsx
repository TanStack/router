import { useLoader, useMatch } from '@tanstack/react-router'
import * as React from 'react'
import { dashboardRoute } from '.'

export const dashboardIndexRoute = dashboardRoute.createRoute({
  path: '/',
  component: DashboardHome,
})

function DashboardHome() {
  const { invoices } = useLoader({ from: dashboardIndexRoute.id })

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
