import { Action } from '@tanstack/router'
import { patchInvoice, postInvoice } from './mockTodos'
import { router } from './router'

export const createInvoiceAction = new Action({
  action: postInvoice,
  onEachSuccess: async () => {
    await router.invalidateRoute({ to: '/dashboard/invoices' })
  },
})

export const updateInvoiceAction = new Action({
  action: patchInvoice,
  onEachSuccess: async () => {
    await router.invalidateRoute({ to: '/dashboard/invoices' })
  },
})
