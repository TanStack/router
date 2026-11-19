// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

// Empty state when no message is selected
export const Route = createSlotRoute({
  path: '/',
  component: PreviewEmpty,
})

function PreviewEmpty() {
  return (
    <div className="preview-empty">
      <p>Select a message to preview</p>
    </div>
  )
}
