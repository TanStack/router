import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/profile')({
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
