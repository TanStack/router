import * as React from 'react'
import { z } from 'zod'
import { fetchInvoiceById, patchInvoice } from '../../../mockTodos'
import { InvoiceFields } from '../../../components/InvoiceFields'
import { invoicesRoute } from '.'
import {
  useNavigate,
  Link,
  Route,
  ErrorComponent,
  ParseRoute,
  RegisteredRouter,
  InferFullSearchSchema,
} from '@tanstack/react-router'
import {
  createLoaderOptions,
  Loader,
  typedClient,
  useLoaderInstance,
} from '@tanstack/react-loaders'
import { useAction } from '@tanstack/react-actions'
import { actionContext } from '../../../actionContext'

class InvoiceNotFoundError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice not found: ${invoiceId}`)
  }
}

export const invoiceLoader = new Loader({
  key: 'invoice',
  fn: async (invoiceId: number) => {
    console.log('Fetching invoice...')
    const invoice = await fetchInvoiceById(invoiceId)

    if (!invoice) {
      throw new InvoiceNotFoundError(`${invoiceId}`)
    }

    return invoice
  },
  onInvalidate: async ({ client }) => {
    typedClient(client).invalidateLoader({ key: 'invoices' })
  },
})

export const updateInvoiceAction = actionContext.createAction({
  key: 'updateInvoice',
  fn: patchInvoice,
  onEachSuccess: async ({ submission, context: { loaderClient } }) => {
    await loaderClient.invalidateInstance({
      key: 'invoice',
      variables: submission.variables.id,
    })
  },
})

export const invoiceRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: '$invoiceId',
  parseParams: (params) => ({
    invoiceId: z.number().int().parse(Number(params.invoiceId)),
  }),
  stringifyParams: ({ invoiceId }) => ({ invoiceId: `${invoiceId}` }),
  validateSearch: z.object({
    showNotes: z.boolean().optional(),
    notes: z.string().optional(),
  }),
  beforeLoad: ({ params: { invoiceId } }) => {
    const loaderOptions = createLoaderOptions({
      key: 'invoice',
      variables: invoiceId,
    })

    return {
      loaderOptions,
    }
  },
  load: async ({ context: { loaderClient, loaderOptions }, preload }) => {
    await loaderClient.load({
      ...loaderOptions,
      preload,
    })
  },
  errorComponent: function InvoiceError({ error }) {
    if (error instanceof InvoiceNotFoundError) {
      return (
        <div>
          <div className="font-bold italic p-2 text-sm opacity-50">
            Invoice not found!
          </div>
        </div>
      )
    }

    return <ErrorComponent error={error} />
  },
  component: function InvoiceView({ useRouteContext, useSearch }) {
    const { loaderOptions } = useRouteContext()
    const { data: invoice } = useLoaderInstance(loaderOptions)
    const search = useSearch()
    const navigate = useNavigate()
    const [updateInvoiceAction, submitUpdateInvoice] = useAction({
      key: 'updateInvoice',
    })

    const [notes, setNotes] = React.useState(search.notes ?? ``)

    React.useEffect(() => {
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
          submitUpdateInvoice({
            variables: {
              id: invoice.id,
              title: formData.get('title') as string,
              body: formData.get('body') as string,
            },
          })
        }}
        className="p-2 space-y-2"
      >
        <InvoiceFields
          invoice={invoice}
          disabled={updateInvoiceAction.latestSubmission?.status === 'pending'}
        />
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
                <div className="italic text-xs">
                  Notes are stored in the URL. Try copying the URL into a new
                  tab!
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div>
          <button
            className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
            disabled={
              updateInvoiceAction.latestSubmission?.status === 'pending'
            }
          >
            Save
          </button>
        </div>
        {updateInvoiceAction.latestSubmission?.variables?.id === invoice.id ? (
          <div key={updateInvoiceAction.latestSubmission?.submittedAt}>
            {updateInvoiceAction.latestSubmission?.status === 'success' ? (
              <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Saved!
              </div>
            ) : updateInvoiceAction.latestSubmission?.status === 'error' ? (
              <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Failed to save.
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    )
  },
})
