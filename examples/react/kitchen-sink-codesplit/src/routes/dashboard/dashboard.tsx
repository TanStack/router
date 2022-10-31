import * as React from 'react'
import { dashboardRoute } from '.'
import { router } from '../../router'

export const dashboardIndexRoute = dashboardRoute.createRoute({
  path: '/',
  element: <DashboardHome />,
})

function DashboardHome() {
  const {
    loaderData: { invoices },
  } = router.useMatch(dashboardIndexRoute.id)

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
