import { ActionClient } from '@tanstack/react-actions'
import { updateInvoiceAction } from './routes/dashboard/invoices/invoice'
import { createInvoiceAction } from './routes/dashboard/invoices/invoices'

export const actionClient = new ActionClient({
  getActions: () => ({
    createInvoiceAction,
    updateInvoiceAction,
  }),
})

declare module '@tanstack/react-actions' {
  interface Register {
    actionClient: typeof actionClient
  }
}
