import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  createFileRoute,
  Link,
  useHydrated,
  useRouter,
} from '@tanstack/react-router'
import { z } from 'zod'
import { createNote, listNotes } from '../server/notes'
export const Route = createFileRoute('/')({
  validateSearch: z.object({ q: z.string().max(200).catch('') }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listNotes({ data: deps }),
  headers: () => ({ 'Cache-Control': 'no-store' }),
  component: Home,
})
function Home() {
  const { q } = Route.useSearch()
  const notes = Route.useLoaderData()
  const save = useServerFn(createNote)
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <main>
      <h1>Field notes</h1>
      <p>
        This checkpoint is a shared local notebook. Accounts come in the next
        chapter.
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
                body: String(fields.get('body') ?? ''),
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
              Body <textarea name="body" required maxLength={5000} />
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
      <form method="get">
        <label>
          Search notes <input name="q" defaultValue={q} maxLength={200} />
        </label>
        <button type="submit">Search</button>
      </form>
      <ul>
        {notes.map((note) => (
          <li key={note.slug}>
            <Link to="/notes/$slug" params={{ slug: note.slug }}>
              {note.title}
            </Link>{' '}
            ({note.categoryName})
          </li>
        ))}
      </ul>
      {notes.length === 0 ? <p>No matching notes.</p> : null}
    </main>
  )
}
