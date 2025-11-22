import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/lazy-page')({
  component: LazyPage,
})

function LazyPage() {
  return (
    <div className="p-2">
      <h3>Lazy Loaded Page</h3>
      <p>This page was loaded lazily.</p>
    </div>
  )
}
