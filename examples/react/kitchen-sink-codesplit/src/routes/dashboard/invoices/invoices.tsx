import * as React from 'react'
import { router } from '../../../router'
import { Invoice, postInvoice } from '../../../mockTodos'
import { InvoiceFields } from '../../../components/InvoiceFields'
import { invoicesRoute } from '.'

export const invoicesIndexRoute = invoicesRoute.createRoute({
  path: '/',
  element: <InvoicesHome />,
  action: async (partialInvoice: Partial<Invoice>) => {
    const invoice = await postInvoice(partialInvoice)
    // // Redirect to the new invoice
    router.navigate({
      to: '/dashboard/invoices/:invoiceId',
      params: {
        invoiceId: invoice.id, // The router doesn't know about this yet
      },
    })
    return invoice
  },
})

function InvoicesHome() {
  const { action } = router.useMatch('/dashboard/invoices/')

  return (
    <>
      <div className="p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const formData = new FormData(event.target as HTMLFormElement)
            action.submit({
              title: formData.get('title') as string,
              body: formData.get('body') as string,
            })
          }}
          className="space-y-2"
        >
          <div>Create a new Invoice:</div>
          <InvoiceFields invoice={{} as Invoice} />
          <div>
            <button
              className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
              disabled={action.current?.status === 'pending'}
            >
              Create
            </button>
          </div>
          {action.current?.status === 'success' ? (
            <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Created!
            </div>
          ) : action.current?.status === 'error' ? (
            <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Failed to create.
            </div>
          ) : null}
        </form>
      </div>
    </>
  )
}
