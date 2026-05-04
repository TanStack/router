/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoute, useLoaderData } from '@tanstack/remix-router'
import { on } from '@remix-run/ui'
import { Route as RootRoute } from './__root'
import {
  type GuestbookEntry,
  addEntry,
  listEntries,
} from '../server/guestbook'
import type { Handle } from '@remix-run/ui'

function GuestbookPage(handle: Handle) {
  const readEntries = useLoaderData(handle, { from: '/guestbook' })
  let pendingName = ''
  let pendingMessage = ''
  let localEntries: Array<GuestbookEntry> | undefined
  let submitting = false
  let submitError: string | undefined

  return () => {
    const entries = (localEntries ?? (readEntries() as Array<GuestbookEntry>)) ?? []

    return (
      <main>
        <h1>Guestbook</h1>
        <p>
          <em>
            Posts are server-validated via <code>createServerFn</code> +{' '}
            <code>.inputValidator</code>; the form below calls the server
            function directly on submit.
          </em>
        </p>

        <form
          mix={[
            on<HTMLFormElement, 'submit'>('submit', async (e: SubmitEvent) => {
              e.preventDefault()
              if (submitting) return
              submitting = true
              submitError = undefined
              void handle.update()
              try {
                const next = await addEntry({
                  data: { name: pendingName, message: pendingMessage },
                })
                localEntries = next
                pendingName = ''
                pendingMessage = ''
                ;(e.target as HTMLFormElement).reset()
              } catch (err) {
                submitError =
                  err instanceof Error ? err.message : String(err)
              } finally {
                submitting = false
                void handle.update()
              }
            }),
          ]}
        >
          <p>
            <input
              type="text"
              name="name"
              placeholder="Name"
              required
              maxlength={60}
              mix={[
                on<HTMLInputElement, 'input'>('input', (e: InputEvent) => {
                  pendingName = (e.target as HTMLInputElement).value
                }),
              ]}
            />
          </p>
          <p>
            <textarea
              name="message"
              placeholder="Say something nice"
              required
              rows={3}
              cols={48}
              mix={[
                on<HTMLTextAreaElement, 'input'>('input', (e: InputEvent) => {
                  pendingMessage = (e.target as HTMLTextAreaElement).value
                }),
              ]}
            />
          </p>
          <p>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Posting…' : 'Post entry'}
            </button>
            {submitError ? (
              <span style={{ color: '#c33', marginLeft: '0.5rem' }}>
                {submitError}
              </span>
            ) : null}
          </p>
        </form>

        <hr />

        <ul>
          {entries.map((e) => (
            <li key={e.id}>
              <strong>{e.name}</strong>: {e.message}{' '}
              <small style={{ opacity: 0.6 }}>
                ({new Date(e.at).toLocaleTimeString()})
              </small>
            </li>
          ))}
          {entries.length === 0 ? (
            <li>
              <em>(empty)</em>
            </li>
          ) : null}
        </ul>
      </main>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/guestbook',
  loader: () => listEntries(),
  component: GuestbookPage,
})
