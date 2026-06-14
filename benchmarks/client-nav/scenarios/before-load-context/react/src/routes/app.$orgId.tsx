import { Outlet, createFileRoute } from '@tanstack/react-router'
import { deriveOrgContext, runContextComputation } from '../../../shared'
import { consumeSelectedValue } from '../runtime'

export const Route = createFileRoute('/app/$orgId')({
  beforeLoad: ({ context, params }) => deriveOrgContext(context, params.orgId),
  component: OrgLayout,
})

function OrgLayout() {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(context.orgChecksum, context.orgPermissions[0], 10),
  })

  consumeSelectedValue(value, 'org-context-subscriber')
  return <Outlet />
}
