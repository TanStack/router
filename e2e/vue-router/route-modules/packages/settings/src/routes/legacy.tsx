import { createFileRoute, redirect } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/vue-settings:/legacy')({
  beforeLoad: () => {
    throw redirect({ to: '/profile' })
  },
})
