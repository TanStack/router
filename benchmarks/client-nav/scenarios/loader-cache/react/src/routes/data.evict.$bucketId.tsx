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

function EvictLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function EvictPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <EvictLoaderDataSubscriber key={`evict-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="evict"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}
