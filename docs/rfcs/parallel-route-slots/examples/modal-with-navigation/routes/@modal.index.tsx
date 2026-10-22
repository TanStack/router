// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

// Modal index - shown when @modal=/
export const Route = createSlotRoute({
  path: '/',
  component: ModalIndex,
})

function ModalIndex() {
  return (
    <div className="modal-index">
      <h2>Quick Actions</h2>
      {/* Navigation within the modal - Route.Link has implicit from */}
      <nav>
        <Route.Link
          slots={{ modal: { to: '/users/$id', params: { id: 'me' } } }}
        >
          View My Profile
        </Route.Link>
        <Route.Link slots={{ modal: { to: '/settings' } }}>Settings</Route.Link>
      </nav>
    </div>
  )
}
