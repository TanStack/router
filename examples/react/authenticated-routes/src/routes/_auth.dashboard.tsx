import * as React from 'react'

import { useAuth } from '../auth'

export const Route = createFileRoute({
  component: DashboardPage,
})

function DashboardPage() {
  const auth = useAuth()

  return (
    <section className="grid gap-2 p-2">
      <p>Hi {auth.user}!</p>
      <p>You are currently on the dashboard route.</p>
    </section>
  )
}
