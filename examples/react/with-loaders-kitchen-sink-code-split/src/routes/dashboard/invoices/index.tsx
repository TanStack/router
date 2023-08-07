import { Link, Outlet, MatchRoute, Route } from '@tanstack/router'
import * as React from 'react'
import { Spinner } from '../../../components/Spinner'
import { dashboardRoute } from '..'
import { invoiceRoute } from './invoice'
import { Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { useAction } from '@tanstack/react-actions'
import { fetchInvoices } from '../../../mockTodos'

export const invoicesLoader = new Loader({
  key: 'invoices',
  fn: async () => {
    console.log('Fetching invoices...')
    return fetchInvoices()
  },
})

export const invoicesRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: 'invoices',
  loader: async ({ context: { loaderClient } }) => {
    await loaderClient.load({ key: 'invoices' })
  },
  component: function Invoices({ useLoader }) {
    const { data: invoices } = useLoaderInstance({ key: 'invoices' })

    // Get the action for a child route
    const [createInvoice] = useAction({ key: 'createInvoice' })
    const [updateInvoice] = useAction({ key: 'updateInvoice' })

    return (
      <div className="flex-1 flex">
        <div className="divide-y w-48">
          {[
            ...invoices,
            {
              id: 11,
              title: 'Not Found',
            },
            {
              id: 1 / 0,
              title: 'Bad ID',
            },
          ]?.map((invoice) => {
            const foundPending = updateInvoice.pendingSubmissions.find(
              (d) => d.variables?.id === invoice.id,
            )

            if (foundPending) {
              invoice = { ...invoice, ...foundPending.variables }
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
                        to={invoiceRoute.to}
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
          {createInvoice.pendingSubmissions.map((submission) => (
            <div key={submission.submittedAt}>
              <a href="#" className="block py-2 px-3 text-blue-700">
                <pre className="text-sm">
                  #<Spinner /> - {submission.variables.title?.slice(0, 10)}
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
  },
})
