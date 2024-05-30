import { useState, useRef } from 'react'
import invariant from 'tiny-invariant'

import { SaveButton } from '~/components/SaveButton'
import { CancelButton } from '~/components/CancelButton'
import { Icon } from '../icons/icons'
import { useNewColumnMutation } from '../queries'
import { newColumnSchema } from '../mocks/db'

export function NewColumn({
  boardId,
  editInitially,
}: {
  boardId: number
  editInitially: boolean
}) {
  const [editing, setEditing] = useState(editInitially)
  const inputRef = useRef<HTMLInputElement>(null)

  const { mutate } = useNewColumnMutation()

  return editing ? (
    <form
      className="p-2 flex-shrink-0 flex flex-col gap-5 overflow-hidden max-h-full w-80 border rounded-xl shadow bg-slate-100"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        formData.set('id', crypto.randomUUID())
        invariant(inputRef.current, 'missing input ref')
        inputRef.current.value = ''
        mutate(newColumnSchema.parse(Object.fromEntries(formData.entries())))
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setEditing(false)
        }
      }}
    >
      <input type="hidden" name="boardId" value={boardId} />
      <input
        autoFocus
        required
        ref={inputRef}
        type="text"
        name="name"
        className="border border-slate-400 w-full rounded-lg py-1 px-2 font-medium text-black"
      />
      <div className="flex justify-between">
        <SaveButton>Save Column</SaveButton>
        <CancelButton onClick={() => setEditing(false)}>Cancel</CancelButton>
      </div>
    </form>
  ) : (
    <button
      onClick={() => {
        setEditing(true)
      }}
      aria-label="Add new column"
      className="flex-shrink-0 flex justify-center h-16 w-16 bg-black hover:bg-white bg-opacity-10 hover:bg-opacity-5 rounded-xl"
    >
      <Icon name="plus" size="xl" />
    </button>
  )
}
