import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/lazy-page')({
  component: LazyPage,
})

function LazyPage() {
  return (
    <div class="p-2">
      <h3>Lazy Loaded Page</h3>
      <p>This page was loaded lazily.</p>
    </div>
  )
}
