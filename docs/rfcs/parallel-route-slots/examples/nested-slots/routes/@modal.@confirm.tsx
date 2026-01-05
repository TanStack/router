// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, useSlot } from '@tanstack/react-router'

// Nested confirmation dialog slot
export const Route = createSlotRootRoute({
  component: ConfirmDialogWrapper,
})

function ConfirmDialogWrapper() {
  const confirm = useSlot('confirm')

  return (
    <div className="confirm-backdrop" onClick={confirm.close}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <Outlet />
      </div>
    </div>
  )
}
