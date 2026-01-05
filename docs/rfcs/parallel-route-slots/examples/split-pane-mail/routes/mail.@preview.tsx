// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRootRoute, Outlet, useSlot } from '@tanstack/react-router'

export const Route = createSlotRootRoute({
  component: PreviewPane,
})

function PreviewPane() {
  const preview = useSlot('preview')

  return (
    <div className="preview-pane">
      {preview.isOpen && preview.path !== '/' && (
        <button className="close-preview" onClick={preview.close}>
          ✕ Close
        </button>
      )}
      <Outlet />
    </div>
  )
}
