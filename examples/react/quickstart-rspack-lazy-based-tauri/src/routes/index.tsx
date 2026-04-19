import { createLazyRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createLazyRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}
