import { Action as _Action, useAction } from '@tanstack/react-actions'

import { InvoiceFields } from '@/components/invoice-fields'
import { Invoice, postInvoice } from '@/utils/mock'

import { Loader as invoicesLoader } from '../_layout'

export const Action = new _Action({
  key: 'createInvoice',
  action: postInvoice,
  onEachSuccess: async () => {
    await invoicesLoader.invalidateAll()
  },
})

export default function InvoicesHome() {
  const action = useAction({ key: 'createInvoice' })

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
              // disabled={action.current?.status === 'pending'}
            >
              Create
            </button>
          </div>
          {action.state.latestSubmission?.status === 'success' ? (
            <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Created!
            </div>
          ) : action.state.latestSubmission?.status === 'error' ? (
            <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Failed to create.
            </div>
          ) : null}
        </form>
      </div>
    </>
  )
}
