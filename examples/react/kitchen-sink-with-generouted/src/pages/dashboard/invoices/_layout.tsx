import { useAction } from '@tanstack/react-actions'
import { useLoaderInstance } from '@tanstack/react-loaders'
import { Link, Outlet, MatchRoute } from '@tanstack/react-router'

import { Spinner } from '@/components/spinner'

import { Action as createInvoiceAction } from './index'

export default function Invoices() {
  const invoicesLoaderInstance = useLoaderInstance({ key: 'invoices' })
  const invoices = invoicesLoaderInstance.state.data

  // Get the action for a child route
  const createInvoice = useAction({ key: createInvoiceAction.key })
  const updateInvoice = useAction({ key: 'updateInvoice' })

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {invoices?.map((invoice) => {
          const foundPending = updateInvoice.state.pendingSubmissions.find((d) => d.payload?.id === invoice.id)

          if (foundPending) {
            invoice = { ...invoice, ...foundPending.payload }
          }

          return (
            <div key={invoice.id}>
              <Link
                to="/dashboard/invoices/$invoiceId"
                params={{ invoiceId: invoice.id }}
                preload="intent"
                className="block py-2 px-3 text-blue-700"
                activeProps={{ className: `font-bold` }}
              >
                <pre className="text-sm">
                  #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                  {foundPending ? (
                    <Spinner />
                  ) : (
                    <MatchRoute to="/dashboard/invoices/$invoiceId" params={{ invoiceId: invoice.id }} pending={true}>
                      <Spinner />
                    </MatchRoute>
                  )}
                </pre>
              </Link>
            </div>
          )
        })}
        {createInvoice.state.pendingSubmissions.map((action) => (
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
