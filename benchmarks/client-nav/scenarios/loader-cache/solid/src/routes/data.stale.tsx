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

  return (
    <PerfValue value={() => runLoaderCacheSelectorComputation(loaderData())} />
  )
}

function StalePage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>{() => <StaleLoaderDataSubscriber />}</For>
      <div
        data-loader-cache-page="stale"
        data-loader-cache-sequence={loaderData().sequence}
      />
    </>
  )
}
