import { createFileRoute, redirect } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/settings:/legacy')({
  beforeLoad: () => {
    throw redirect({ to: '/profile' })
  },
})
