// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, useSlot } from '@tanstack/react-router'

// This is the slot's root route - wraps all modal content
export const Route = createSlotRootRoute({
  component: ModalWrapper,
})

function ModalWrapper() {
  const modal = useSlot('modal')

  return (
    <div className="modal-backdrop" onClick={modal.close}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={modal.close}>
          ×
        </button>

        {/* Render the matched modal route */}
        <Outlet />
      </div>
    </div>
  )
}
