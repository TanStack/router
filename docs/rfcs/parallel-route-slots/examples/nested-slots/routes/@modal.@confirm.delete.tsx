// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

// Confirm delete account dialog
export const Route = createSlotRoute({
  path: '/delete',
  component: DeleteConfirm,
})

function DeleteConfirm() {
  const navigate = Route.useNavigate()

  const handleDelete = async () => {
    await deleteAccount()
    // Close the entire modal (and its nested slots)
    navigate({ slots: { modal: null } })
    // In reality you'd also redirect to a logged-out page
  }

  const handleCancel = () => {
    // Close just the confirm dialog, keep modal open
    navigate({ slots: { modal: { slots: { confirm: null } } } })
  }

  return (
    <div className="confirm-content">
      <h3>Delete Account?</h3>
      <p>
        This action cannot be undone. All your data will be permanently deleted.
      </p>

      <div className="confirm-actions">
        <button onClick={handleCancel}>Cancel</button>
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
