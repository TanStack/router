import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import { Route as dataRoute } from './data'
import {
  PerfValue,
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

  return (
    <PerfValue value={() => runLoaderCacheSelectorComputation(loaderData())} />
  )
}

function EvictPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>{() => <EvictLoaderDataSubscriber />}</For>
      <div
        data-loader-cache-page="evict"
        data-loader-cache-sequence={loaderData().sequence}
      />
    </>
  )
}
