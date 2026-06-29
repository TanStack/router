import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/hydration-capped-assets')({
  beforeLoad: () => {
    throw notFound()
  },
  notFoundComponent: () => (
    <div data-testid="issue-7-parent-not-found">Parent not found</div>
  ),
  component: () => <Outlet />,
})
