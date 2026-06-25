import { createRoute } from '@tanstack/react-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

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

function StaleLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function StalePage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <StaleLoaderDataSubscriber key={`stale-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="stale"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}
