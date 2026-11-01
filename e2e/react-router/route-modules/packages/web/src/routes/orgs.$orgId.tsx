import { Outlet, createFileRoute } from '@tanstack/react-router'

// The host route of the modules mounted per organization: they get its path
// params in their URLs and the organization as context, and its settings
// installation the organization as their owner.
export const Route = createFileRoute('/orgs/$orgId')({
  beforeLoad: ({ params }) => {
    const name = params.orgId.toUpperCase()
    return {
      org: { id: params.orgId, name },
      owner: { kind: 'organization' as const, id: params.orgId, name },
    }
  },
  component: () => <Outlet />,
})
