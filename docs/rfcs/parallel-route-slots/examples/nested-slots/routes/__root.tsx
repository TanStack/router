// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  slots: {
    modal: true, // auto-wired from @modal.tsx
  },
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <body>
        <Outlet />
        <Route.SlotOutlet name="modal" />
      </body>
    </html>
  )
}
