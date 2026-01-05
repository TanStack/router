// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, useSlot } from '@tanstack/react-router'

export const Route = createSlotRootRoute({
  // Modal has its own nested slot for confirmation dialogs
  slots: {
    confirm: true, // auto-wired from @modal.@confirm.tsx
  },
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

        {/* Modal content */}
        <Outlet />

        {/* Nested confirmation dialog slot */}
        <Route.SlotOutlet name="confirm" />
      </div>
    </div>
  )
}
