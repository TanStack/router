import { createFileRoute, useHydrated, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { createNote, listNotes } from '../server/notes'
export const Route = createFileRoute('/')({
  loader: () => listNotes(),
  headers: () => ({ 'Cache-Control': 'no-store' }),
  component: Notes,
})
function Notes() {
  const notes = Route.useLoaderData()
  const save = useServerFn(createNote)
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <main>
      <h1>Postgres notes</h1>
      <p>
        A shared local database example. Anyone who can access this app can
        create notes.
      </p>
      <form
        method="post"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const fields = new FormData(form)
          setPending(true)
          setError('')
          try {
            const result = await save({
              data: {
                slug: String(fields.get('slug') ?? ''),
                title: String(fields.get('title') ?? ''),
                category: String(fields.get('category') ?? ''),
              },
            })
            if (result.error) {
              setError(result.error)
            } else {
              await router.invalidate()
              form.reset()
            }
          } catch {
            setError('Could not save. Check your input and try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        <fieldset disabled={!hydrated || pending}>
          <legend>Create a note</legend>
          <p>
            <label>
              Slug{' '}
              <input
                name="slug"
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
          </p>
          <p>
            <label>
              Title <input name="title" required maxLength={120} />
            </label>
          </p>
          <p>
            <label>
              Category <input name="category" required maxLength={40} />
            </label>
          </p>
          <button type="submit">{pending ? 'Saving...' : 'Create note'}</button>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      <ul>
        {notes.map((note) => (
          <li key={note.slug}>
            {note.title} ({note.categoryName})
          </li>
        ))}
      </ul>
    </main>
  )
}
