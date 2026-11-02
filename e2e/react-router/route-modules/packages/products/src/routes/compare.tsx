import { z } from 'zod'
import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/compare')({
  validateSearch: z.object({ ids: z.array(z.string()) }),
  component: Compare,
})

function Compare() {
  const { ids } = Route.useSearch()
  return (
    <>
      <h1>Compare</h1>
      <p className="lead">Comparing products {ids.join(' and ')}.</p>
    </>
  )
}
