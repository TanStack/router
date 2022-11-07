import * as React from 'react'
import dashboardRoute from '../dashboard'
import { router } from '../../router'

const routeDef = dashboardRoute.createRoute({
  path: '/',
  element: <DashboardHome />,
})

export default routeDef

function DashboardHome() {
  const {
    loaderData: { invoices },
  } = router.useMatch(routeDef.id)

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
