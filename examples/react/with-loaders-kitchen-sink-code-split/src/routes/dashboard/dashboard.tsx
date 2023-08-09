import { useLoaderInstance } from '@tanstack/react-loaders'
import { Route } from '@tanstack/react-router'
import * as React from 'react'
import { dashboardRoute } from '.'
import { invoicesLoader } from './invoices'

export const dashboardIndexRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: DashboardHome,
})

function DashboardHome() {
  const { data: invoices } = useLoaderInstance({ key: 'invoices' })

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
