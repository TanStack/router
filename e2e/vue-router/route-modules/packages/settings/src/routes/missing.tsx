import { createFileRoute, notFound } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/vue-settings:/missing')({
  component: () => {
    throw notFound({ routeId: '@route-modules/vue-settings:' })
  },
})
