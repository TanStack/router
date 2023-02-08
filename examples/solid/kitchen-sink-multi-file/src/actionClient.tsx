import { ActionClient } from '@tanstack/solid-actions'
import { updateInvoiceAction } from './routes/dashboard/invoices/invoice'
import { createInvoiceAction } from './routes/dashboard/invoices/invoices'

export const actionClient = new ActionClient({
  getActions: () => [createInvoiceAction, updateInvoiceAction],
})

declare module '@tanstack/solid-actions' {
  interface Register {
    actionClient: typeof actionClient
  }
}
