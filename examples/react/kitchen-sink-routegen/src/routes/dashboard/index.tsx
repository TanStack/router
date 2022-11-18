import { useMatch } from '@tanstack/react-router'
import * as React from 'react'
import dashboardRoute from '../dashboard'

const routeConfig = dashboardRoute.createRoute({
  path: '/',
  component: DashboardHome,
})

export default routeConfig

function DashboardHome() {
  const {
    loaderData: { invoices },
  } = useMatch(routeConfig.id)

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
