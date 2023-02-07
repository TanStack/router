import { useAction } from '@tanstack/solid-actions'
import { useLoaderInstance } from '@tanstack/solid-loaders'
import { Link, MatchRoute, Outlet, Route } from '@tanstack/solid-router'
import { createMemo, For, Show } from 'solid-js'
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
        <For each={invoicesLoaderInstance.state.data}>
          {(invoice) => {
            const pendingInvoice = () =>
              updateInvoice.state?.pendingSubmissions.find(
                (d) => d.payload?.id === invoice.id,
              )

            const updatedInvoice = createMemo(() => {
              if (pendingInvoice()) {
                return { ...invoice, ...pendingInvoice()!.payload }
              } else {
                return invoice
              }
            })

            return (
              <div>
                <Link
                  to="/dashboard/invoices/$invoiceId"
                  params={{
                    invoiceId: updatedInvoice().id,
                  }}
                  preload="intent"
                  class="block py-2 px-3 text-blue-700"
                  activeProps={{ class: `font-bold` }}
                >
                  <pre class="text-sm">
                    #{updatedInvoice().id} -{' '}
                    {updatedInvoice().title.slice(0, 10)}
                    <Show when={!pendingInvoice()} fallback={<Spinner />}>
                      <MatchRoute
                        to={updatedInvoice().id.toString()}
                        params={{
                          invoiceId: updatedInvoice().id,
                        }}
                        pending
                      >
                        <Spinner />
                      </MatchRoute>
                    </Show>
                  </pre>
                </Link>
              </div>
            )
          }}
        </For>
        <For each={createInvoice.state?.pendingSubmissions}>
          {(action) => (
            <div>
              <a href="#" class="block py-2 px-3 text-blue-700">
                <pre class="text-sm">
                  #<Spinner /> - {action.payload.title?.slice(0, 10)}
                </pre>
              </a>
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
