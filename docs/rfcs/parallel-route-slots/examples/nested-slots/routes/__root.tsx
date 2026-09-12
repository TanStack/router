// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createRootRoute, Outlet } from '@tanstack/react-router'

// Slots are NOT declared here - they're discovered from @modal.tsx files
// after composition. Route.Outlet gains type-safe slot prop automatically.
export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <body>
        <Outlet />
        <Route.Outlet slot="modal" />
      </body>
    </html>
  )
}
