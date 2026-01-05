// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createSlotRootRoute({
  // Modal has its own nested slot for confirmation dialogs
  slots: {
    confirm: true, // auto-wired from @modal.@confirm.tsx
  },
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
        <Route.SlotOutlet name="confirm" />
      </div>
    </div>
  )
}
