import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/vue-settings:/search')({
  validateSearch: (search: { query: string }) => search,
})
