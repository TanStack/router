import { createRoute } from '@tanstack/react-router'
import {
  createDetailsLoaderData,
  deferredRouteStaleTime,
} from '../../../shared'
import { DeferredValue } from '../deferred-value'
import { Route as itemRoute } from './deferred.items.$itemId'

export const Route = createRoute({
  getParentRoute: () => itemRoute,
  path: 'details',
  loader: ({ params }) => createDetailsLoaderData(params.itemId),
  staleTime: deferredRouteStaleTime(),
  gcTime: 0,
  component: DetailsPage,
})

function DetailsPage() {
  const data = Route.useLoaderData()

  return (
    <section data-deferred-page="details" data-deferred-id={data.critical.id}>
      <strong data-deferred-critical={data.critical.checksum}>
        {data.critical.label}
      </strong>
      <DeferredValue markerKey={data.detailsKey} promise={data.details} />
    </section>
  )
}
