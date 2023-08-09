import * as React from 'react'
import { Invoice, postInvoice } from '../../../mockTodos'
import { InvoiceFields } from '../../../components/InvoiceFields'
import { invoicesRoute } from '.'
import { useAction } from '@tanstack/react-actions'
import { Route } from '@tanstack/react-router'
import { actionContext } from '../../../actionContext'

export const createInvoiceAction = actionContext.createAction({
  key: 'createInvoice',
  fn: postInvoice,
  onEachSuccess: async ({ context: { loaderClient } }) => {
    await loaderClient.invalidateLoader({ key: 'invoices' })
  },
})

export const invoicesIndexRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: '/',
  component: function InvoicesHome() {
    const [createInvoiceAction, submitCreateInvoice] = useAction({
      key: 'createInvoice',
    })

    return (
      <>
        <div className="p-2">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const formData = new FormData(event.target as HTMLFormElement)
              submitCreateInvoice({
                variables: {
                  title: formData.get('title') as string,
                  body: formData.get('body') as string,
                },
              })
            }}
            className="space-y-2"
          >
            <div>Create a new Invoice:</div>
            <InvoiceFields invoice={{} as Invoice} />
            <div>
              <button
                className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
                // disabled={action.current?.status === 'pending'}
              >
                Create
              </button>
            </div>
            {createInvoiceAction.latestSubmission?.status === 'success' ? (
              <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Created!
              </div>
            ) : createInvoiceAction.latestSubmission?.status === 'error' ? (
              <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Failed to create.
              </div>
            ) : null}
          </form>
        </div>
      </>
    )
  },
})
