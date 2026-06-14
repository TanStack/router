import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import { Route as listRoute } from './data.list'
import {
  PerfValue,
  buildLoaderCachePayload,
  createItemLoaderDeps,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

export const Route = createRoute({
  getParentRoute: () => listRoute,
  path: '$itemId',
  loaderDeps: ({ search }) =>
    createItemLoaderDeps(search as Record<string, unknown>),
  loader: ({ deps, params }) => {
    const sequence = loaderCacheRuntime.recordSyncLoad('item')
    return buildLoaderCachePayload(
      'item',
      sequence,
      String(params.itemId).length * 97 +
        deps.filter.length * 13 +
        deps.tag.length,
    )
  },
  staleTime: 60_000,
  gcTime: 60_000,
  component: ItemPage,
})

function ItemLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  return (
    <PerfValue value={() => runLoaderCacheSelectorComputation(loaderData())} />
  )
}

function ItemPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>{() => <ItemLoaderDataSubscriber />}</For>
      <div
        data-loader-cache-page="item"
        data-loader-cache-sequence={loaderData().sequence}
      />
    </>
  )
}
