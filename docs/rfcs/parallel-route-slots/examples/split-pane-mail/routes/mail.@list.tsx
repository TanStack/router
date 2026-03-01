// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createSlotRootRoute({
  component: ListPane,
})

function ListPane() {
  return (
    <div className="list-pane">
      <Outlet />
    </div>
  )
}
