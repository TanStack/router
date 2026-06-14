import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

const BlockingLoaderDataSubscriber = Vue.defineComponent({
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

const BlockingPage = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <BlockingLoaderDataSubscriber key={`blocking-data-${slot}`} />
        ))}
        <div
          data-loader-cache-page="blocking"
          data-loader-cache-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => dataRoute,
  path: 'blocking',
  loader: {
    handler: () =>
      loaderCacheRuntime.createControlledLoad('blocking', (sequence) =>
        buildLoaderCachePayload('blocking', sequence, 29),
      ),
    staleReloadMode: 'blocking',
  },
  staleTime: 0,
  gcTime: 60_000,
  component: BlockingPage,
})
