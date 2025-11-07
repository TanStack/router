import { createFileRoute } from '@tanstack/preact-router'

export const Route = createFileRoute('/_auth/invoices/')({
  component: () => <div>Select an invoice to view it!</div>,
})
