import { useAction } from '@tanstack/solid-actions'
import { useLoaderInstance } from '@tanstack/solid-loaders'
import { Link, Outlet, Route } from '@tanstack/solid-router'
import { For, Show } from 'solid-js'
import { dashboardRoute, invoicesLoader } from '..'
import { Spinner } from '../../../components/Spinner'
import { updateInvoiceAction } from './invoice'
import { createInvoiceAction } from './invoices'

export const invoicesRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: 'invoices',
  component: () => <Invoices />,
})

function Invoices() {
  const invoicesLoaderInstance = useLoaderInstance({
    key: invoicesLoader.key,
  })

  // Get the action for a child route
  const createInvoice = useAction({ key: createInvoiceAction.key })
  const updateInvoice = useAction({ key: updateInvoiceAction.key })

  return (
    <div class="flex-1 flex">
      <div class="divide-y w-48">
        <For each={invoicesLoaderInstance.state.data || []}>
          {(invoice) => {
            const pendingInvoice = () =>
              updateInvoice.state.submissions.find(
                (d) => d.payload.id === invoice.id,
              )

            return (
              <div>
                <Link
                  to="/dashboard/invoices/$invoiceId"
                  params={{
                    invoiceId: invoice?.id,
                  }}
                  preload="intent"
                  class="block py-2 px-3 text-blue-700"
                  activeProps={{ class: `font-bold` }}
                >
                  <pre class="text-sm">
                    #{invoice.id} - {invoice.title.slice(0, 10)}
                    <Show when={pendingInvoice()?.status === 'pending'}>
                      <Spinner />
                    </Show>
                  </pre>
                </Link>
              </div>
            )
          }}
        </For>
        <For each={createInvoice.state?.submissions}>
          {(action) => (
            <div>
              <Show when={action.status === 'pending'}>
                <a href="#" class="block py-2 px-3 text-blue-700">
                  <pre class="text-sm">
                    #<Spinner /> - {action.payload.title?.slice(0, 10)}
                  </pre>
                </a>
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="flex-1 border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}
