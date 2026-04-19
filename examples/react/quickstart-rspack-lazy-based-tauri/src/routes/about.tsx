import { createLazyRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createLazyRoute('/about')({
  component: AboutComponent,
})

function AboutComponent() {
  return (
    <div className="p-2">
      <h3>About</h3>
    </div>
  )
}
