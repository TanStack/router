import { useLoaderInstance } from '@tanstack/solid-loaders'
import { Route } from '@tanstack/solid-router'
import { dashboardRoute, invoicesLoader } from '.'

export const dashboardIndexRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: () => <DashboardHome />,
})

function DashboardHome() {
  const invoicesLoaderInstance = useLoaderInstance({ key: invoicesLoader.key })

  return (
    <div class="p-2">
      <div class="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>
          {invoicesLoaderInstance.state.data.length} total invoices
        </strong>
        .
      </div>
    </div>
  )
}
