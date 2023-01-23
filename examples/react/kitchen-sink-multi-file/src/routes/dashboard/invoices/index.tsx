import {
  Link,
  Outlet,
  useLoaderInstance,
  MatchRoute,
  useAction,
} from '@tanstack/react-router'
import * as React from 'react'
import { Spinner } from '../../../components/Spinner'
import { dashboardRoute } from '..'
import { invoiceRoute } from './invoice'
import { createInvoiceAction, updateInvoiceAction } from '../../../actions'

export const invoicesRoute = dashboardRoute.createRoute({
  path: 'invoices',
  component: Invoices,
})

function Invoices() {
  const { invoices } = useLoaderInstance({ from: invoicesRoute.id })

  // Get the action for a child route
  const createInvoice = useAction(createInvoiceAction)
  const updateInvoice = useAction(updateInvoiceAction)

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {invoices?.map((invoice) => {
          const foundPending = updateInvoice.pendingSubmissions.find(
            (d) => d.payload?.id === invoice.id,
          )

          if (foundPending) {
            invoice = { ...invoice, ...foundPending.payload }
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
                activeProps={{ className: `font-bold` }}
              >
                <pre className="text-sm">
                  #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                  {foundPending ? (
                    <Spinner />
                  ) : (
                    <MatchRoute
                      to={invoiceRoute.id}
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
        {createInvoice.pendingSubmissions.map((action) => (
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
