import {
  Link,
  MatchRoute,
  Outlet,
  useAction,
  useLoaderInstance,
  useMatch,
  useRoute,
} from '@tanstack/router'
import * as React from 'react'
import { createInvoiceAction, updateInvoiceAction } from '../../actions'
import { Spinner } from '../../components/Spinner'
import { routeConfig } from '../../routes.generated/dashboard/invoices'
import { dashboardInvoicesinvoiceIdRoute } from '../../routes.generated/dashboard/invoices/$invoiceId.client'

routeConfig.generate({
  component: Invoices,
})

function Invoices() {
  const { invoices } = useLoaderInstance({ from: routeConfig.id })

  const invoiceIndexAction = useAction(createInvoiceAction)
  const invoiceDetailAction = useAction(updateInvoiceAction)

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {invoices?.map((invoice) => {
          const foundPending = invoiceDetailAction.pendingSubmissions.find(
            (d) => d.payload?.id === invoice.id,
          )
          if (foundPending) {
            invoice = {
              ...invoice,
              ...foundPending.payload,
            }
          }
          return (
            <div key={invoice.id}>
              <Link
                to="/dashboard/invoices/$invoiceId"
                params={{
                  invoiceId: invoice.id,
                }}
                preload="intent"
                className="block py-2 px-3 text-blue-700"
                activeProps={{
                  className: `font-bold`,
                }}
              >
                <pre className="text-sm">
                  #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                  {foundPending ? (
                    <Spinner />
                  ) : (
                    <MatchRoute
                      to={dashboardInvoicesinvoiceIdRoute.fullPath}
                      params={{
                        invoiceId: invoice.id,
                      }}
                      pending
                    >
                      <Spinner />
                    </MatchRoute>
                  )}
                </pre>
              </Link>
            </div>
          )
        })}
        {invoiceIndexAction.pendingSubmissions.map((action) => (
          <div key={action.submittedAt}>
            <a href="#" className="block py-2 px-3 text-blue-700">
              <pre className="text-sm">
                #<Spinner /> - {action.payload.title?.slice(0, 10)}
              </pre>
            </a>
          </div>
        ))}
      </div>
      <div className="flex-1 border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}
