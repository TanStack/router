import {
  Link,
  MatchRoute,
  Outlet,
  useAction,
  useLoaderData,
  useMatch,
  useRoute,
} from '@tanstack/react-router'
import * as React from 'react'
import { Spinner } from '../../components/Spinner'
import { routeConfig } from '../../routes.generated/dashboard/invoices'
import { dashboardInvoicesinvoiceIdRoute } from '../../routes.generated/dashboard/invoices/$invoiceId.client'
import { dashboardInvoicesIndexRoute } from '../../routes.generated/dashboard/invoices/index.client'

routeConfig.generate({
  component: Invoices,
})

function Invoices() {
  const { invoices } = useLoaderData({ from: routeConfig.id })

  const invoiceIndexAction = useAction({ from: dashboardInvoicesIndexRoute.id })
  const invoiceDetailAction = useAction({
    from: dashboardInvoicesinvoiceIdRoute.id,
  })

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {invoices?.map((invoice) => {
          const foundPending = invoiceDetailAction.submissions.find(
            (d) => d.submission?.id === invoice.id,
          )
          if (foundPending?.submission) {
            invoice = {
              ...invoice,
              ...foundPending.submission,
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
                      to={dashboardInvoicesinvoiceIdRoute.id}
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
        {invoiceIndexAction.submissions.map((action) => (
          <div key={action.submittedAt}>
            <a href="#" className="block py-2 px-3 text-blue-700">
              <pre className="text-sm">
                #<Spinner /> - {action.submission.title?.slice(0, 10)}
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
