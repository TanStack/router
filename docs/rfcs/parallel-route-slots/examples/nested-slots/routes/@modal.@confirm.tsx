// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet } from '@tanstack/react-router'

// Nested confirmation dialog slot
export const Route = createSlotRootRoute({
  component: ConfirmDialogWrapper,
})

function ConfirmDialogWrapper() {
  const navigate = Route.useNavigate()

  const handleClose = () => {
    // Close just the confirm dialog, keep modal open
    navigate({ slots: { modal: { slots: { confirm: null } } } })
  }

  return (
    <div className="confirm-backdrop" onClick={handleClose}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <Outlet />
      </div>
    </div>
  )
}
