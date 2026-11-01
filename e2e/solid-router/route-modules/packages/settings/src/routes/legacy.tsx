import { createFileRoute, redirect } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/solid-settings:/legacy')({
  beforeLoad: () => {
    throw redirect({ to: '/profile' })
  },
})
