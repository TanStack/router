import { Outlet, createRoute } from '@tanstack/react-router'
import { Route as dataRoute } from './data'
import {
  buildLoaderCachePayload,
  createListLoaderDeps,
  loaderCacheRuntime,
  normalizeListSearch,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

export const Route = createRoute({
  getParentRoute: () => dataRoute,
  path: 'list',
  validateSearch: (search: Record<string, unknown>) =>
    normalizeListSearch(search),
  loaderDeps: ({ search }) => createListLoaderDeps(search),
  loader: ({ deps }) => {
    const sequence = loaderCacheRuntime.recordSyncLoad('list')
    return buildLoaderCachePayload(
      'list',
      sequence,
      deps.page * 101 + deps.filter.length * 7 + deps.tag.length,
    )
  },
  staleTime: 60_000,
  gcTime: 60_000,
  component: ListPage,
})

function ListLoaderDepsSubscriber() {
  const deps = Route.useLoaderDeps({
    select: (loaderDeps) =>
      loaderDeps.page + loaderDeps.filter.length + loaderDeps.tag.length,
  })

  void runLoaderCacheSelectorComputation(deps)
  return null
}

function ListLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function ListPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <ListLoaderDepsSubscriber key={`list-deps-${slot}`} />
      ))}
      {subscriberSlots.map((slot) => (
        <ListLoaderDataSubscriber key={`list-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="list"
        data-loader-cache-sequence={loaderData.sequence}
      />
      <Outlet />
    </>
  )
}
