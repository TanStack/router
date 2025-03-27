import { Trans } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout/_nested-layout/route-a')(
  {
    component: LayoutAComponent,
  },
)

function LayoutAComponent() {
  return <div><Trans>I'm A!</Trans></div>
}
