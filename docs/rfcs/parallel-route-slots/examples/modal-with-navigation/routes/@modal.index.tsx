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
      <nav>
        <Link slot="modal" to="/users/$id" params={{ id: 'me' }}>
          View My Profile
        </Link>
        <Link slot="modal" to="/settings">
          Settings
        </Link>
      </nav>
    </div>
  )
}
