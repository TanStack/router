import { createFileRoute, notFound } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/solid-settings:/missing')({
  component: () => {
    throw notFound({ routeId: '@route-modules/solid-settings:' })
  },
})
