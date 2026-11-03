import { createFileRoute, notFound } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/settings:/missing')({
  component: () => {
    throw notFound({ routeId: '@route-modules/settings:' })
  },
})
