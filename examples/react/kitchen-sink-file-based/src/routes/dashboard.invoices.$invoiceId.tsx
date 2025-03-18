import * as React from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { z } from 'zod'
import { InvoiceFields } from '../components/InvoiceFields'
import { useMutation } from '../hooks/useMutation'
import { fetchInvoiceById, patchInvoice } from '../utils/mockTodos'

export const Route = createFileRoute('/dashboard/invoices/$invoiceId')({
  params: {
    parse: (params) => ({
      invoiceId: z.number().int().parse(Number(params.invoiceId)),
    }),
    stringify: ({ invoiceId }) => ({ invoiceId: `${invoiceId}` }),
  },
  validateSearch: (search) =>
    z
      .object({
        showNotes: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .parse(search),
  loader: ({ params: { invoiceId } }) => fetchInvoiceById(invoiceId),
  component: InvoiceComponent,
})

function InvoiceComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const invoice = Route.useLoaderData()
  const router = useRouter()
  const updateInvoiceMutation = useMutation({
    fn: patchInvoice,
    onSuccess: () => router.invalidate(),
  })
  const [notes, setNotes] = React.useState(search.notes ?? '')

  React.useEffect(() => {
    navigate({
      search: (old) => ({
        ...old,
        notes: notes ? notes : undefined,
      }),
      replace: true,
      params: true,
    })
  }, [notes])

  return (
    <form
      key={invoice.id}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const formData = new FormData(event.target as HTMLFormElement)
        updateInvoiceMutation.mutate({
          id: invoice.id,
          title: formData.get('title') as string,
          body: formData.get('body') as string,
        })
      }}
      className="p-2 space-y-2"
    >
      <InvoiceFields
        invoice={invoice}
        disabled={updateInvoiceMutation.status === 'pending'}
      />
      <div>
        <Link
          from={Route.fullPath}
          search={(old) => ({
            ...old,
            showNotes: old.showNotes ? undefined : true,
          })}
          className="text-blue-700"
          params={true}
        >
          {search.showNotes ? 'Close Notes' : 'Show Notes'}{' '}
        </Link>
        {search.showNotes ? (
          <>
            <div>
              <div className="h-2" />
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                }}
                rows={5}
                className="shadow w-full p-2 rounded"
                placeholder="Write some notes here..."
              />
              <div className="italic text-xs">
                Notes are stored in the URL. Try copying the URL into a new tab!
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div>
        <button
          className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
          disabled={updateInvoiceMutation.status === 'pending'}
        >
          Save
        </button>
      </div>
      {updateInvoiceMutation.variables?.id === invoice.id ? (
        <div key={updateInvoiceMutation.submittedAt}>
          {updateInvoiceMutation.status === 'success' ? (
            <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Saved!
            </div>
          ) : updateInvoiceMutation.status === 'error' ? (
            <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Failed to save.
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
