import { updateInvoiceAction } from './routes/dashboard/invoices/invoice'
import { createInvoiceAction } from './routes/dashboard/invoices/invoices'
import { actionContext } from './actionContext'
import { loaderClient } from './loaderClient'

export const actionClient = actionContext.createClient({
  actions: [createInvoiceAction, updateInvoiceAction],
  context: {
    loaderClient,
  },
})

declare module '@tanstack/react-actions' {
  interface Register {
    actionClient: typeof actionClient
  }
}
