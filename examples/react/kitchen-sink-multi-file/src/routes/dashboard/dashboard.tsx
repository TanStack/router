import { useLoader } from '@tanstack/react-loaders'
import { Route } from '@tanstack/router'
import * as React from 'react'
import { dashboardRoute } from '.';
import { invoicesLoader } from './invoices';

export const dashboardIndexRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: DashboardHome,
})

function DashboardHome() {
  const invoicesLoaderInstance = useLoader({ key: invoicesLoader.key })
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
