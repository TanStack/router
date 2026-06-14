import { Outlet, createFileRoute } from '@tanstack/solid-router'
import { deriveOrgContext, runContextComputation } from '../../../shared'
import { PerfValue, consumeSelectedValue } from '../runtime'

export const Route = createFileRoute('/app/$orgId')({
  beforeLoad: ({ context, params }) => deriveOrgContext(context, params.orgId),
  component: OrgLayout,
})

function OrgLayout() {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(context.orgChecksum, context.orgPermissions[0], 10),
  })

  return (
    <>
      <PerfValue
        value={() => consumeSelectedValue(value(), 'org-context-subscriber')}
      />
      <Outlet />
    </>
  )
}
