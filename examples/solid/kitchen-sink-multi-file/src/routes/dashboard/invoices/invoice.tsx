import { Action, useAction } from '@tanstack/solid-actions'
import { Loader, useLoaderInstance } from '@tanstack/solid-loaders'
import {
  Link,
  Route,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/solid-router'
import { createEffect, createSignal, Match, Show, Switch } from 'solid-js'
import { z } from 'zod'
import { invoicesRoute } from '.'
import { invoicesLoader } from '..'
import { InvoiceFields } from '../../../components/InvoiceFields'
import { fetchInvoiceById, patchInvoice } from '../../../mockTodos'

export const invoiceLoader = new Loader({
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

export const updateInvoiceAction = new Action({
  key: 'updateInvoice',
  action: patchInvoice,
  onEachSuccess: async ({ payload }) => {
    await invoiceLoader.invalidate({
      variables: payload.id,
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
  component: () => <InvoiceView />,
  onLoad: async ({ params: { invoiceId }, preload }) =>
    invoiceLoader.load({
      variables: invoiceId,
      preload,
    }),
})

function InvoiceView() {
  const params = useParams({ from: invoiceRoute.id })
  const invoiceLoaderInstance = useLoaderInstance({
    key: invoiceLoader.key,
    variables: params.invoiceId,
  })
  const search = useSearch({ from: invoiceRoute.id })
  const action = useAction({ key: updateInvoiceAction.key })
  const navigate = useNavigate({ from: invoiceRoute.id })

  const [notes, setNotes] = createSignal(search.notes ?? ``)

  createEffect(() => {
    const notesData = notes()
    navigate({
      search: (old) => ({ ...old, notes: notesData ? notesData : undefined }),
      replace: true,
    })
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const formData = new FormData(event.target as HTMLFormElement)
        action.submit({
          id: params.invoiceId,
          title: formData.get('title') as string,
          body: formData.get('body') as string,
        })
      }}
      class="p-2 space-y-2"
    >
      <InvoiceFields
        invoice={invoiceLoaderInstance.state.data}
        disabled={action.state.submissions.at(-1)?.status === 'pending'}
      />
      <div>
        <Link
          search={(old) => ({
            ...old,
            showNotes: old?.showNotes ? false : true,
          })}
          class="text-blue-700"
        >
          <Show when={!!search.showNotes} keyed fallback="Show Notes">
            Close Notes
          </Show>
        </Link>
        <Show when={search.showNotes}>
          <div>
            <div class="h-2" />
            <textarea
              value={notes()}
              onChange={(e) => setNotes(e.currentTarget.value)}
              rows={5}
              class="shadow w-full p-2 rounded"
              placeholder="Write some notes here..."
            />
            <div class="italic text-xs">
              Notes are stored in the URL. Try copying the URL into a new tab!
            </div>
          </div>
        </Show>
      </div>
      <div>
        <button
          class="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
          disabled={action.state?.latestSubmission?.status === 'pending'}
        >
          Save
        </button>
      </div>
      <Show
        when={action.state?.latestSubmission?.payload?.id === params.invoiceId}
      >
        <div>
          <Switch>
            <Match when={action.state?.latestSubmission?.status === 'success'}>
              <div class="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Saved!
              </div>
            </Match>
            <Match when={action.state.latestSubmission?.status === 'error'}>
              <div class="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Failed to save.
              </div>
            </Match>
          </Switch>
        </div>
      </Show>
    </form>
  )
}
