// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link } from '@tanstack/react-router'

// Modal index - shown when @modal=/
export const Route = createSlotRoute({
  path: '/',
  component: ModalIndex,
})

function ModalIndex() {
  return (
    <div className="modal-index">
      <h2>Quick Actions</h2>
      {/* Navigation within the modal - context knows we're in @modal */}
      <nav>
        <Link to="/users/$id" params={{ id: 'me' }}>
          View My Profile
        </Link>
        <Link to="/settings">Settings</Link>
      </nav>
    </div>
  )
}
