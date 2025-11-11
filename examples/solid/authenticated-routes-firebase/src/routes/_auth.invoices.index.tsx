import { createFileRoute } from '@tanstack/solid-router'
import * as Solid from 'solid-js'

export const Route = createFileRoute('/_auth/invoices/')({
  component: () => <div>Select an invoice to view it!</div>,
})
