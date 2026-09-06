import * as React from 'react'
import {
  Link,
  createFileRoute,
  useBlocker,
  useRouter,
} from '@tanstack/react-router'

export const Route = createFileRoute('/history-blocking')({
  validateSearch: (search: Record<string, unknown>) => ({
    step: Number(search.step) || 0,
  }),
  component: HistoryBlocking,
})

function HistoryBlocking() {
  const router = useRouter()
  const { step } = Route.useSearch()
  const [draft, setDraft] = React.useState('')
  const [ignoreBlocker, setIgnoreBlocker] = React.useState(false)
  const { status } = useBlocker({
    shouldBlockFn: () => draft.length > 0,
    enableBeforeUnload: draft.length > 0,
    withResolver: true,
  })

  return (
    <div>
      <h1>History blocking</h1>
      <p>Step {step}</p>
      <label>
        Draft
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={ignoreBlocker}
          onChange={(event) => setIgnoreBlocker(event.target.checked)}
        />
        Ignore blockers
      </label>
      <p>{draft ? 'Unsaved changes' : 'No changes'}</p>
      <p>Blocker status: {status}</p>
      <Link to="/history-blocking" search={{ step: step + 1 }}>
        Add history entry
      </Link>
      <button
        onClick={() =>
          router.history.back(
            ignoreBlocker ? { ignoreBlocker: true } : undefined,
          )
        }
      >
        History back
      </button>
      <button
        onClick={() =>
          router.history.forward(
            ignoreBlocker ? { ignoreBlocker: true } : undefined,
          )
        }
      >
        History forward
      </button>
      {[-2, -1, 0, 1, 2].map((delta) => (
        <button
          key={delta}
          onClick={() =>
            router.history.go(
              delta,
              ignoreBlocker ? { ignoreBlocker: true } : undefined,
            )
          }
        >
          History go({delta})
        </button>
      ))}
      <a href="/">Leave document</a>
    </div>
  )
}
