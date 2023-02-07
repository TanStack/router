import { Loader } from '@tanstack/solid-loaders'
import { Link, Outlet, Route } from '@tanstack/solid-router'
import { For } from 'solid-js'
import { fetchInvoices } from '../../mockTodos'
import { rootRoute } from '../__root'

export const invoicesLoader = new Loader({
  key: 'invoices',
  loader: async () => {
    console.log('Fetching invoices...')
    return fetchInvoices()
  },
})

export const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  component: () => <Dashboard />,
  onLoad: ({ preload }) => invoicesLoader.load({ preload }),
})

function Dashboard() {
  return (
    <>
      <div class="flex items-center border-b">
        <h2 class="text-xl p-2">Dashboard</h2>
        <Link
          to="/dashboard/invoices/$invoiceId"
          params={{
            invoiceId: 3,
          }}
          class="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
        >
          1 New Invoice
        </Link>
      </div>
      <div class="flex flex-wrap divide-x">
        <For
          each={
            [
              ['/dashboard', 'Summary', undefined, true],
              ['/dashboard/invoices', 'Invoices'],
              ['/dashboard/users', 'Users', true],
            ] as const
          }
        >
          {([to, label, search, exact]) => (
            <Link
              to={to}
              search={search}
              activeOptions={{ exact }}
              activeProps={{ class: `font-bold` }}
              class="p-2"
            >
              {label}
            </Link>
          )}
        </For>
      </div>
      <hr />
      <Outlet />
    </>
  )
}
