import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { invoicesQueryOptions } from '../utils/queryOptions'
import { useSuspenseQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/dashboard/')({
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(invoicesQueryOptions()),
  component: DashboardIndexComponent,
})

function DashboardIndexComponent() {
  const invoicesQuery = useSuspenseQuery(invoicesQueryOptions())
  const invoices = invoicesQuery.data

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
