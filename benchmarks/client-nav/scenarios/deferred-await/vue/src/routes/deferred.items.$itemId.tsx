import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import {
  createItemLoaderData,
  deferredRouteStaleTime,
  type ItemLoaderData,
} from '../../../shared'
import { createDeferredValueNode } from '../deferred-value'
import { Route as rootRoute } from './__root'

const ItemPage = Vue.defineComponent({
  setup() {
    const data = Route.useLoaderData() as Vue.Ref<ItemLoaderData>

    return () => (
      <main data-deferred-page="item" data-deferred-id={data.value.critical.id}>
        <strong data-deferred-critical={data.value.critical.checksum}>
          {data.value.critical.label}
        </strong>
        {createDeferredValueNode(data.value.primaryKey, data.value.primary)}
        {createDeferredValueNode(data.value.secondaryKey, data.value.secondary)}
        <Outlet />
      </main>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred/items/$itemId',
  loader: ({ params }) => createItemLoaderData(params.itemId),
  staleTime: deferredRouteStaleTime(),
  gcTime: 0,
  component: ItemPage,
})
