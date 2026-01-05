// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  // Declare the modal slot - references the @modal route tree
  slots: {
    modal: true, // auto-wired from @modal.tsx
  },
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        {/* Main content */}
        <Outlet />

        {/* Modal slot - rendered on top of everything */}
        <Route.SlotOutlet name="modal" />
      </body>
    </html>
  )
}
