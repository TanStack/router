import { createAction } from '@tanstack/react-router'
import { patchInvoice, postInvoice } from './mockTodos'
import { router } from './router'

export const createInvoiceAction = createAction({
  action: postInvoice,
  onEachSuccess: async () => {
    await router.invalidateRoute({ to: '/dashboard/invoices' })
  },
})

export const updateInvoiceAction = createAction({
  action: patchInvoice,
  onEachSuccess: async () => {
    await router.invalidateRoute({ to: '/dashboard/invoices' })
  },
})
