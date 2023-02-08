import { Action, useAction } from '@tanstack/solid-actions'
import { Route } from '@tanstack/solid-router'
import { Match, Switch } from 'solid-js'
import { invoicesRoute } from '.'
import { invoicesLoader } from '..'
import { InvoiceFields } from '../../../components/InvoiceFields'
import { Invoice, postInvoice } from '../../../mockTodos'

export const createInvoiceAction = new Action({
  key: 'createInvoice',
  action: postInvoice,
  onEachSuccess: async () => {
    await invoicesLoader.invalidateAll()
  },
})

export const invoicesIndexRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: '/',
  component: () => <InvoicesHome />,
})

function InvoicesHome() {
  const action = useAction({ key: createInvoiceAction.key })

  return (
    <>
      <div class="p-2">
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
          class="space-y-2"
        >
          <div>Create a new Invoice:</div>
          <InvoiceFields invoice={{} as Invoice} />
          <div>
            <button
              class="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
              // disabled={action.current?.status === 'pending'}
            >
              Create
            </button>
          </div>
          <Switch>
            <Match when={action.state.latestSubmission?.status === 'success'}>
              <div class="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Created!
              </div>
            </Match>
            <Match when={action.state.latestSubmission?.status === 'error'}>
              <div class="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Failed to create.
              </div>
            </Match>
          </Switch>
        </form>
      </div>
    </>
  )
}
