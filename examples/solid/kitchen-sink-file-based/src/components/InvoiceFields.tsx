/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import * as Solid from 'solid-js'
import type { Invoice } from '../utils/mockTodos'

export function InvoiceFields({
  invoice,
  disabled,
}: {
  invoice: Invoice
  disabled?: boolean
}) {
  return (
    <div class="space-y-2">
      <h2 class="font-bold text-lg">
        <input
          name="title"
          defaultValue={invoice?.title}
          placeholder="Invoice Title"
          class="border border-opacity-50 rounded p-2 w-full"
          disabled={disabled}
        />
      </h2>
      <div>
        <textarea
          name="body"
          defaultValue={invoice?.body}
          rows={6}
          placeholder="Invoice Body..."
          class="border border-opacity-50 p-2 rounded w-full"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
