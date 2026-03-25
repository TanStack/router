import { createFileRoute } from '@tanstack/solid-router'

// This creates a dedicated /[locale]/404 route
// It's used both as a direct route and imported as a component in other files
export const Route = createFileRoute('/{-$locale}/404')({
  component: NotFoundComponent,
})

// Exported separately so it can be reused in notFoundComponent and catch-all routes
export function NotFoundComponent() {
  return (
    <div>
      <h1>404</h1>
    </div>
  )
}
