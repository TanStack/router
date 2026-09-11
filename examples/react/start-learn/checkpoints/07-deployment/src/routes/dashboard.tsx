import { getCurrentUser } from '../server/session'
import { authClient } from '../auth-client'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  createFileRoute,
  Link,
  redirect,
  useHydrated,
  useRouter,
} from '@tanstack/react-router'
import { createNote, listOwnNotes, setPublished } from '../server/notes'
export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({
        to: '/login',
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
    return { user }
  },
  loader: () => listOwnNotes(),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: Home,
})
function Home() {
  const { user } = Route.useRouteContext()
  const notes = Route.useLoaderData()
  const save = useServerFn(createNote)
  const publish = useServerFn(setPublished)
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <main>
      <Link to="/" search={{ q: '' }}>
        Published notes
      </Link>
      <h1>My notes</h1>
      <p>{user.email}</p>
      <button
        disabled={!hydrated || pending}
        onClick={async () => {
          setPending(true)
          setError('')
          try {
            const result = await authClient.signOut()
            if (result.error) {
              throw new Error('Sign out failed')
            }
            await router.invalidate()
            await router.navigate({ to: '/login' })
          } catch {
            setError('Could not sign out. Try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        Sign out
      </button>
      <p>New notes are private until you publish them.</p>
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
      <ul>
        {notes.map((note) => (
          <li key={note.slug}>
            <Link to="/drafts/$slug" params={{ slug: note.slug }}>
              {note.title}
            </Link>{' '}
            {note.isPublished ? 'Published' : 'Private'}
            <button
              disabled={!hydrated || pending}
              onClick={async () => {
                setPending(true)
                setError('')
                try {
                  await publish({
                    data: { slug: note.slug, isPublished: !note.isPublished },
                  })
                  await router.invalidate()
                } catch {
                  setError('Could not change visibility. Try again.')
                } finally {
                  setPending(false)
                }
              }}
            >
              {note.isPublished ? 'Unpublish' : 'Publish'}
            </button>
          </li>
        ))}
      </ul>
      {notes.length === 0 ? <p>No notes yet.</p> : null}
    </main>
  )
}
