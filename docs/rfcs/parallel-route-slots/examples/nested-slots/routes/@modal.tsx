// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet } from '@tanstack/react-router'

// Nested slots are NOT declared here - they're discovered from @modal.@confirm.tsx
// after composition. Route.Outlet gains type-safe slot prop automatically.
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

        {/* Modal content */}
        <Outlet />

        {/* Nested confirmation dialog slot */}
        <Route.Outlet slot="confirm" />
      </div>
    </div>
  )
}
