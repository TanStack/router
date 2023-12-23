import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute('/about').createRoute({
  component: AboutComponent,
})

function AboutComponent() {
  return (
    <div className="p-2">
      <h3>About</h3>
    </div>
  )
}
