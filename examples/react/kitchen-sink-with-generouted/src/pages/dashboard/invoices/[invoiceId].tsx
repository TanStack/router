import { useEffect, useState } from 'react'
import { Action as _Action, useAction } from '@tanstack/react-actions'
import { Loader as _Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { useNavigate, useSearch, Link, useParams } from '@tanstack/react-router'
import { z } from 'zod'

import { fetchInvoiceById, patchInvoice } from '@/utils/mock'
import { InvoiceFields } from '@/components/invoice-fields'

import { Loader as invoicesLoader } from '../_layout'

export const Action = new _Action({
  key: 'updateInvoice',
  action: patchInvoice,
  onEachSuccess: async ({ payload }) => {
    await Loader.invalidate({
      variables: payload.id,
    })
  },
})

export const Loader = new _Loader({
  key: 'invoice',
  loader: async (invoiceId: number) => {
    console.log('Fetching invoice...')
    const invoice = await fetchInvoiceById(invoiceId)

    if (!invoice) {
      throw new Error('Invoice not found!')
    }

    return invoice
  },
  onAllInvalidate: async () => {
    await invoicesLoader.invalidateAll()
  },
})

export const Config = {
  parseParams: (params) => ({
    invoiceId: z.number().int().parse(Number(params.invoiceId)),
  }),
  stringifyParams: ({ invoiceId }) => ({ invoiceId: `${invoiceId}` }),
  validateSearch: z.object({
    showNotes: z.boolean().optional(),
    notes: z.string().optional(),
  }),
  onLoad: async ({ params: { invoiceId }, preload }) => Loader.load({ variables: invoiceId, preload }),
}

export default function InvoiceView() {
  const { invoiceId } = useParams({ from: '/dashboard/invoices/$invoiceId' })
  const invoiceLoaderInstance = useLoaderInstance({
    key: 'invoice',
    variables: invoiceId,
  })
  const invoice = invoiceLoaderInstance.state.data
  const search = useSearch({ from: '/dashboard/invoices/$invoiceId' })
  const action = useAction({ key: 'updateInvoice' })
  const navigate = useNavigate({ from: '/dashboard/invoices/$invoiceId' })

  const [notes, setNotes] = useState(search.notes ?? ``)

  useEffect(() => {
    navigate({
      search: (old) => ({ ...old, notes: notes ? notes : undefined }),
      replace: true,
    })
  }, [notes])

  return (
    <form
      key={invoice.id}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const formData = new FormData(event.target as HTMLFormElement)
        action.submit({
          id: invoice.id,
          title: formData.get('title') as string,
          body: formData.get('body') as string,
        })
      }}
      className="p-2 space-y-2"
    >
      <InvoiceFields invoice={invoice} disabled={action.state.latestSubmission?.status === 'pending'} />
      <div>
        <Link
          search={(old) => ({
            ...old,
            showNotes: old?.showNotes ? undefined : true,
          })}
          className="text-blue-700"
        >
          {search.showNotes ? 'Close Notes' : 'Show Notes'}{' '}
        </Link>
        {search.showNotes ? (
          <>
            <div>
              <div className="h-2" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                className="shadow w-full p-2 rounded"
                placeholder="Write some notes here..."
              />
              <div className="italic text-xs">Notes are stored in the URL. Try copying the URL into a new tab!</div>
            </div>
          </>
        ) : null}
      </div>
      <div>
        <button
          className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
          disabled={action.state.latestSubmission?.status === 'pending'}
        >
          Save
        </button>
      </div>
      {action.state.latestSubmission?.payload?.id === invoice.id ? (
        <div key={action.state.latestSubmission?.submittedAt}>
          {action.state.latestSubmission?.status === 'success' ? (
            <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Saved!
            </div>
          ) : action.state.latestSubmission?.status === 'error' ? (
            <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Failed to save.
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
