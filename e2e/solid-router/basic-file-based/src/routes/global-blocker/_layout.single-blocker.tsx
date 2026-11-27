import { createFileRoute, useBlocker } from '@tanstack/solid-router'

export const Route = createFileRoute('/global-blocker/_layout/single-blocker')({
  component: SingleBlockerPage,
})

function SingleBlockerPage() {
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    enableBeforeUnload: false,
    withResolver: true,
  })

  return (
    <div>
      <h1>This page always blocks navigation</h1>
      <div data-testid="blocker-status">blocker is {blocker().status}</div>
    </div>
  )
}
