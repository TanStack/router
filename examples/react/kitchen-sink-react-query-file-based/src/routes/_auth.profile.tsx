import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute("/_auth/profile").createRoute({
  component: ProfileComponent,
})

function ProfileComponent() {
  const { username } = Route.useRouteContext()

  return (
    <div className="p-2 space-y-2">
      <div>
        Username:<strong>{username}</strong>
      </div>
    </div>
  )
}
