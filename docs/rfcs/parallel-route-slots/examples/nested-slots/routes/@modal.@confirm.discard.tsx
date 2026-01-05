// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, useSlot } from '@tanstack/react-router'

// Confirm discard changes dialog
export const Route = createSlotRoute({
  path: '/discard',
  component: DiscardConfirm,
})

function DiscardConfirm() {
  const modal = useSlot('modal')
  const confirm = useSlot('confirm')

  const handleDiscard = () => {
    // Close both the confirm dialog and the modal
    modal.close()
  }

  const handleCancel = () => {
    // Just close the confirm dialog, keep modal open
    confirm.close()
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
