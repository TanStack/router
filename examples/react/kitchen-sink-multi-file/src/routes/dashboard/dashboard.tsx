import { useLoaderInstance } from '@tanstack/react-loaders'
import * as React from 'react'
import { dashboardRoute, invoicesLoader } from '.'

export const dashboardIndexRoute = dashboardRoute.createRoute({
  path: '/',
  component: DashboardHome,
})

function DashboardHome() {
  const [{ data: invoices }] = useLoaderInstance({ key: invoicesLoader.key })

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
