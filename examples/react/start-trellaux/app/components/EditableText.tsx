import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useUpdateMutation } from '../queries.js'
import { updateSchema } from '../mocks/db.js'

export function EditableText({
  children,
  fieldName,
  value,
  inputClassName,
  inputLabel,
  buttonClassName,
  buttonLabel,
}: {
  children: React.ReactNode
  fieldName: string
  value: string
  inputClassName: string
  inputLabel: string
  buttonClassName: string
  buttonLabel: string
}) {
  const { mutate, status, variables } = useUpdateMutation()
  const [edit, setEdit] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // optimistic update
  if (status === 'pending') {
    value = variables.name
  }

  const submit = (form: HTMLFormElement) => {
    const formData = new FormData(form)
    mutate(updateSchema.parse(Object.fromEntries(formData.entries())))
  }

  return edit ? (
    <form
      onSubmit={(event) => {
        event.preventDefault()

        submit(event.currentTarget)

        flushSync(() => {
          setEdit(false)
        })
        buttonRef.current?.focus()
      }}
    >
      {children}
      <input
        required
        ref={inputRef}
        type="text"
        aria-label={inputLabel}
        name={fieldName}
        defaultValue={value}
        className={inputClassName}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            flushSync(() => {
              setEdit(false)
            })
            buttonRef.current?.focus()
          }
        }}
        onBlur={(event) => {
          if (
            inputRef.current?.value !== value &&
            inputRef.current?.value.trim() !== ''
          ) {
            submit(event.currentTarget.form!)
          }
          setEdit(false)
        }}
      />
    </form>
  ) : (
    <button
      aria-label={buttonLabel}
      type="button"
      ref={buttonRef}
      onClick={() => {
        flushSync(() => {
          setEdit(true)
        })
        inputRef.current?.select()
      }}
      className={buttonClassName}
    >
      {value || <span className="text-slate-400 italic">Edit</span>}
    </button>
  )
}
