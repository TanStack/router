import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  normalizeConditionalSearch,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

const ConditionalLoaderDepsSubscriber = Vue.defineComponent({
  setup() {
    const deps = Route.useLoaderDeps({
      select: (loaderDeps) => loaderDeps.key.length,
    })

    return () => {
      void runLoaderCacheSelectorComputation(deps.value)
      return null
    }
  },
})

const ConditionalLoaderDataSubscriber = Vue.defineComponent({
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

const ConditionalPage = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <ConditionalLoaderDepsSubscriber key={`conditional-deps-${slot}`} />
        ))}
        {subscriberSlots.map((slot) => (
          <ConditionalLoaderDataSubscriber key={`conditional-data-${slot}`} />
        ))}
        <div
          data-loader-cache-page="conditional"
          data-loader-cache-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => dataRoute,
  path: 'conditional',
  validateSearch: (search: Record<string, unknown>) =>
    normalizeConditionalSearch(search),
  loaderDeps: ({ search }) => ({ key: search.key }),
  shouldReload: ({ location }) => {
    const search = normalizeConditionalSearch(
      location.search as Record<string, unknown>,
    )
    return loaderCacheRuntime.recordConditionalCheck(search.mode !== 'skip')
  },
  loader: ({ deps }) => {
    const sequence = loaderCacheRuntime.recordSyncLoad('conditional')
    return buildLoaderCachePayload(
      'conditional',
      sequence,
      deps.key.length * 31,
    )
  },
  staleTime: 0,
  gcTime: 60_000,
  component: ConditionalPage,
})
