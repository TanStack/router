import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  createDetailsLoaderData,
  deferredRouteGcTime,
  deferredRouteStaleTime,
  type DetailsLoaderData,
} from '../../../shared'
import { createDeferredValueNode } from '../deferred-value'
import { Route as itemRoute } from './deferred.items.$itemId'

const DetailsPage = Vue.defineComponent({
  setup() {
    const data = Route.useLoaderData() as Vue.Ref<DetailsLoaderData>

    return () => (
      <section
        data-deferred-page="details"
        data-deferred-id={data.value.critical.id}
      >
        <strong data-deferred-critical={data.value.critical.checksum}>
          {data.value.critical.label}
        </strong>
        {createDeferredValueNode(data.value.detailsKey, data.value.details)}
      </section>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => itemRoute,
  path: 'details',
  loader: ({ params }) => createDetailsLoaderData(params.itemId),
  staleTime: deferredRouteStaleTime(),
  gcTime: deferredRouteGcTime,
  component: DetailsPage,
})
