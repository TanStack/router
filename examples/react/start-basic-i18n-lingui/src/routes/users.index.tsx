import { Trans } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/')({
  component: UsersIndexComponent,
})

function UsersIndexComponent() {
  return <div><Trans>Select a user.</Trans></div>
}
