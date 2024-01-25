import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'

import { useAuth } from '../auth'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  const auth = useAuth()
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
      <p>
        <Link to="/dashboard" className="font-semibold">
          {auth.isAuthenticated ? 'Go' : 'Try going'} to the dashboard page
        </Link>
      </p>
    </div>
  )
}
