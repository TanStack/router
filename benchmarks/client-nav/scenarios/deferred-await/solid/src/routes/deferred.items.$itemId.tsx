import { Outlet, createRoute } from '@tanstack/solid-router'
import {
  createItemLoaderData,
  deferredRouteGcTime,
  deferredRouteStaleTime,
} from '../../../shared'
import { DeferredValue } from '../deferred-value'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred/items/$itemId',
  loader: ({ params }) => createItemLoaderData(params.itemId),
  staleTime: deferredRouteStaleTime(),
  gcTime: deferredRouteGcTime,
  component: ItemPage,
})

function ItemPage() {
  const data = Route.useLoaderData()

  return (
    <main data-deferred-page="item" data-deferred-id={data().critical.id}>
      <strong data-deferred-critical={data().critical.checksum}>
        {data().critical.label}
      </strong>
      <DeferredValue markerKey={data().primaryKey} promise={data().primary} />
      <DeferredValue
        markerKey={data().secondaryKey}
        promise={data().secondary}
      />
      <Outlet />
    </main>
  )
}
