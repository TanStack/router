import { Outlet, createFileRoute } from '@tanstack/react-router'

// The host route of the settings installation per person.
export const Route = createFileRoute('/people/$personId')({
  beforeLoad: ({ params }) => ({
    owner: {
      kind: 'person' as const,
      id: params.personId,
      name: params.personId[0]!.toUpperCase() + params.personId.slice(1),
    },
  }),
  component: () => <Outlet />,
})
