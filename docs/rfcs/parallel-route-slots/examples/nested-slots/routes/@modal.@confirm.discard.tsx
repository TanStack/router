// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

// Confirm discard changes dialog
export const Route = createSlotRoute({
  path: '/discard',
  component: DiscardConfirm,
})

function DiscardConfirm() {
  const navigate = Route.useNavigate()

  const handleDiscard = () => {
    // Close the entire modal (and its nested slots)
    navigate({ slots: { modal: null } })
  }

  const handleCancel = () => {
    // Just close the confirm dialog, keep modal open
    navigate({ slots: { modal: { slots: { confirm: null } } } })
  }

  return (
    <div className="confirm-content">
      <h3>Discard changes?</h3>
      <p>You have unsaved changes. Are you sure you want to discard them?</p>

      <div className="confirm-actions">
        <button onClick={handleCancel}>Keep Editing</button>
        <button onClick={handleDiscard} className="danger">
          Discard Changes
        </button>
      </div>
    </div>
  )
}
