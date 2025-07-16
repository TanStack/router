import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/_auth/invoices/')({
  component: () => <div>Select an invoice to view it!</div>,
})
