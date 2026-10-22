// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet } from '@tanstack/react-router'

// This is the slot's root route - wraps all modal content
export const Route = createSlotRootRoute({
  component: ModalWrapper,
})

function ModalWrapper() {
  const navigate = Route.useNavigate()

  const handleClose = () => {
    navigate({ slots: { modal: null } })
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>
          ×
        </button>

        {/* Render the matched modal route */}
        <Outlet />
      </div>
    </div>
  )
}
