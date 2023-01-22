import { useLoader, useMatch } from '@tanstack/react-router'
import * as React from 'react'
import { routeConfig } from '../../routes.generated/dashboard/index'

routeConfig.generate({
  component: DashboardHome,
})

function DashboardHome() {
  const { invoices } = useLoader({ from: routeConfig.id })

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
