import * as React from 'react'
import { Outlet, useMatch } from '@tanstack/react-router'
import { fetchInvoices } from '../mockTodos'
import { routeConfig } from '../routes.generated/dashboard'
import { dashboardInvoicesinvoiceIdRoute } from '../routes.generated/dashboard/invoices/$invoiceId'

routeConfig.generate({
  component: Dashboard,
  loader: async () => {
    console.log('Fetching all invoices...')
    return {
      invoices: await fetchInvoices(),
    }
  },
})

function Dashboard() {
  const route = useMatch(routeConfig.id)

  return (
    <>
      <div className="flex items-center border-b">
        <h2 className="text-xl p-2">Dashboard</h2>
        <route.Link
          to={dashboardInvoicesinvoiceIdRoute.id}
          params={{
            invoiceId: 3,
          }}
          className="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
        >
          1 New Invoice
        </route.Link>
      </div>
      <div className="flex flex-wrap divide-x">
        {(
          [
            ['.', 'Summary'],
            ['/dashboard/invoices', 'Invoices'],
            ['/dashboard/users', 'Users', true],
          ] as const
        ).map(([to, label, search]) => {
          return (
            <route.Link
              key={to}
              to={to}
              search={search}
              activeOptions={{
                exact: to === '.',
              }}
              activeProps={{
                className: `font-bold`,
              }}
              className="p-2"
            >
              {label}
            </route.Link>
          )
        })}
      </div>
      <hr />
      <Outlet />
    </>
  )
}
