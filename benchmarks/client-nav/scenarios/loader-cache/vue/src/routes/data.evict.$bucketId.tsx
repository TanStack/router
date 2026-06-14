import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

const EvictLoaderDataSubscriber = Vue.defineComponent({
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

const EvictPage = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <EvictLoaderDataSubscriber key={`evict-data-${slot}`} />
        ))}
        <div
          data-loader-cache-page="evict"
          data-loader-cache-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => dataRoute,
  path: 'evict/$bucketId',
  loader: ({ params }) => {
    const sequence = loaderCacheRuntime.recordSyncLoad('evict')
    return buildLoaderCachePayload(
      'evict',
      sequence,
      String(params.bucketId).length * 43,
    )
  },
  staleTime: 60_000,
  gcTime: 60_000,
  component: EvictPage,
})
