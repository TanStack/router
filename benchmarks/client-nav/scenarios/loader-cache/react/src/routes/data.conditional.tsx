import { createRoute } from '@tanstack/react-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  normalizeConditionalSearch,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

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

function ConditionalLoaderDepsSubscriber() {
  const deps = Route.useLoaderDeps({
    select: (loaderDeps) => loaderDeps.key.length,
  })

  void runLoaderCacheSelectorComputation(deps)
  return null
}

function ConditionalLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function ConditionalPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <ConditionalLoaderDepsSubscriber key={`conditional-deps-${slot}`} />
      ))}
      {subscriberSlots.map((slot) => (
        <ConditionalLoaderDataSubscriber key={`conditional-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="conditional"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}
