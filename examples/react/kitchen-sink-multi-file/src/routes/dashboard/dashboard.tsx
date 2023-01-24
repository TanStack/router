import { useLoaderInstance } from '@tanstack/react-loaders'
import * as React from 'react'
import { dashboardRoute, invoicesLoader } from '.'

export const dashboardIndexRoute = dashboardRoute.createRoute({
  path: '/',
  component: DashboardHome,
})

function DashboardHome() {
  const invoicesLoaderInstance = useLoaderInstance({ key: invoicesLoader.key })
  const invoices = invoicesLoaderInstance.state.data

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
