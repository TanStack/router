// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, useSlot } from '@tanstack/react-router'

// Confirm delete account dialog
export const Route = createSlotRoute({
  path: '/delete',
  component: DeleteConfirm,
})

function DeleteConfirm() {
  const modal = useSlot('modal')
  const confirm = useSlot('confirm')

  const handleDelete = async () => {
    await deleteAccount()
    // Close everything and redirect
    modal.close()
    // In reality you'd also redirect to a logged-out page
  }

  return (
    <div className="confirm-content">
      <h3>Delete Account?</h3>
      <p>
        This action cannot be undone. All your data will be permanently deleted.
      </p>

      <div className="confirm-actions">
        <button onClick={confirm.close}>Cancel</button>
        <button onClick={handleDelete} className="danger">
          Yes, Delete My Account
        </button>
      </div>
    </div>
  )
}

async function deleteAccount() {
  console.log('Account deleted')
}
