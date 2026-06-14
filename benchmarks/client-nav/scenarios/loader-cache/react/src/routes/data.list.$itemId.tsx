import { createRoute } from '@tanstack/react-router'
import { Route as listRoute } from './data.list'
import {
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

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function ItemPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <ItemLoaderDataSubscriber key={`item-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="item"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}
