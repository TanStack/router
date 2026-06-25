import * as Vue from 'vue'
import { Outlet, createRoute, useRouterState } from '@tanstack/vue-router'
import { Route as rootRoute } from './__root'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

const RouterLoadingSubscriber = Vue.defineComponent({
  setup() {
    const loading = useRouterState({
      select: (state) =>
        (state.isLoading ? 1 : 0) + (state.status === 'pending' ? 1 : 0),
    })

    return () => {
      void runLoaderCacheSelectorComputation(loading.value)
      return null
    }
  },
})

const DataLoaderDataSubscriber = Vue.defineComponent({
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

const DataLayout = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        <RouterLoadingSubscriber />
        {subscriberSlots.map((slot) => (
          <DataLoaderDataSubscriber key={`data-loader-${slot}`} />
        ))}
        <div
          data-loader-cache-page="data"
          data-loader-cache-sequence={loaderData.value.sequence}
        />
        <Outlet />
      </>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/data',
  loader: () => {
    const sequence = loaderCacheRuntime.recordSyncLoad('data')
    return buildLoaderCachePayload('data', sequence, 11)
  },
  staleTime: 60_000,
  gcTime: 60_000,
  component: DataLayout,
})
