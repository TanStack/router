import * as React from 'react'


export const Route = createFileRoute({
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
