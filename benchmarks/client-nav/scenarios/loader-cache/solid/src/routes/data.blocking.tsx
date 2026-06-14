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

function BlockingLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  return (
    <PerfValue value={() => runLoaderCacheSelectorComputation(loaderData())} />
  )
}

function BlockingPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>{() => <BlockingLoaderDataSubscriber />}</For>
      <div
        data-loader-cache-page="blocking"
        data-loader-cache-sequence={loaderData().sequence}
      />
    </>
  )
}
