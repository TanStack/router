
import { createQuery } from '@tanstack/solid-query'
import { invoicesQueryOptions } from '../utils/queryOptions'

export const Route = createFileRoute({
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(invoicesQueryOptions()),
  component: DashboardIndexComponent,
})

function DashboardIndexComponent() {
  const invoicesQuery = createQuery(()=>invoicesQueryOptions())
  const invoices = invoicesQuery.data

  return (
    <div class="p-2">
      <div class="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices?.length} total invoices</strong>.
      </div>
    </div>
  )
}
