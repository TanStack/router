import * as React from 'react'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { fetchInvoices } from '../utils/mockTodos'

export const Route = createFileRoute('/dashboard/')({
  loader: () => fetchInvoices(),
  component: DashboardIndexComponent,
})

function DashboardIndexComponent() {
  const invoices = Route.useLoaderData()

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
