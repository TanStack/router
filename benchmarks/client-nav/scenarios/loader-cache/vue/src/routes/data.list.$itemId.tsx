import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { Route as listRoute } from './data.list'
import {
  buildLoaderCachePayload,
  createItemLoaderDeps,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

const ItemLoaderDataSubscriber = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData({
      select: (data) => data.checksum + data.sequence,
    })

    return () => {
      void runLoaderCacheSelectorComputation(loaderData.value)
      return null
    }
  },
})

const ItemPage = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <ItemLoaderDataSubscriber key={`item-data-${slot}`} />
        ))}
        <div
          data-loader-cache-page="item"
          data-loader-cache-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => listRoute,
  path: '$itemId',
  loaderDeps: ({ search }) =>
    createItemLoaderDeps(search as Record<string, unknown>),
  loader: ({ deps, params }) => {
    const sequence = loaderCacheRuntime.recordSyncLoad('item')
    return buildLoaderCachePayload(
      'item',
      sequence,
      String(params.itemId).length * 97 +
        deps.filter.length * 13 +
        deps.tag.length,
    )
  },
  staleTime: 60_000,
  gcTime: 60_000,
  component: ItemPage,
})
