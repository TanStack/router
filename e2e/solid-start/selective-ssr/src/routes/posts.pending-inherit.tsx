import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/posts/pending-inherit')({
  pendingMs: 0,
  pendingComponent: () => (
    <div data-testid="pending-inherit-fallback">Pending inherit fallback</div>
  ),
  loader: () => new Promise<never>(() => {}),
  component: () => (
    <div data-testid="pending-inherit-route">Pending inherit route</div>
  ),
})
