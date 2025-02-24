import * as React from 'react'
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/workingpreload')({
  component: WorkingPreloadComponent,
})

function WorkingPreloadComponent() {
  return (
    <div className="p-2">
      <h3>Working Preload</h3>
    </div>
  )
}
