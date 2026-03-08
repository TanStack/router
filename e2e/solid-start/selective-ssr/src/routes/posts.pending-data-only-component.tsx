import { createFileRoute } from '@tanstack/solid-router'
import { createResource } from 'solid-js'

function PendingDataOnlyComponent() {
  const [value] = createResource(() => new Promise<string>(() => {}))

  return <div data-testid="pending-data-only-route">{value()}</div>
}

export const Route = createFileRoute('/posts/pending-data-only-component')({
  pendingMs: 0,
  pendingComponent: () => (
    <div data-testid="pending-data-only-fallback">
      Pending data-only fallback
    </div>
  ),
  component: PendingDataOnlyComponent,
})
