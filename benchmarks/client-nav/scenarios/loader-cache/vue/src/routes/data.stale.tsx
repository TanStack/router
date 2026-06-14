import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

const StaleLoaderDataSubscriber = Vue.defineComponent({
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

const StalePage = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <StaleLoaderDataSubscriber key={`stale-data-${slot}`} />
        ))}
        <div
          data-loader-cache-page="stale"
          data-loader-cache-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => dataRoute,
  path: 'stale',
  loader: () =>
    loaderCacheRuntime.createControlledLoad('stale', (sequence) =>
      buildLoaderCachePayload('stale', sequence, 23),
    ),
  staleTime: 0,
  gcTime: 60_000,
  component: StalePage,
})
