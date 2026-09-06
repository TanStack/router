// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, useMatch } from '@tanstack/react-router'

export const Route = createSlotRootRoute({
  component: PreviewPane,
})

function PreviewPane() {
  const navigate = Route.useNavigate()

  // Check if we're at something other than the preview root
  const previewMatch = useMatch({ from: '/mail/@preview', shouldThrow: false })
  const isAtRoot = previewMatch?.pathname === '/'

  const handleClose = () => {
    navigate({ slots: { preview: null } })
  }

  return (
    <div className="preview-pane">
      {previewMatch && !isAtRoot && (
        <button className="close-preview" onClick={handleClose}>
          ✕ Close
        </button>
      )}
      <Outlet />
    </div>
  )
}
