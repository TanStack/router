import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/split')({
  component: Split,
})

function Split() {
  return <h1 data-testid="split-route">Split route</h1>
}
