import { createFileRoute, useBlocker } from '@tanstack/solid-router'

export const Route = createFileRoute('/global-blocker/_layout/popstate')({
  component: PopstatePage,
})

function PopstatePage() {
  const navigate = Route.useNavigate()

  const blocker = useBlocker({
    shouldBlockFn: ({ action }) => action !== 'PUSH' && action !== 'REPLACE',
    enableBeforeUnload: false,
    withResolver: true,
  })

  return (
    <div>
      <h1>Popstate blocker</h1>
      <div data-testid="blocker-status">blocker is {blocker().status}</div>
      <button
        data-testid="add-entry"
        onClick={() =>
          navigate({ to: '/global-blocker/popstate', hash: `s${Date.now()}` })
        }
      >
        add entry
      </button>
    </div>
  )
}
