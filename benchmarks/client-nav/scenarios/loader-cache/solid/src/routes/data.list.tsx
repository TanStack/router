import { For } from 'solid-js'
import { Outlet, createRoute } from '@tanstack/solid-router'
import { Route as dataRoute } from './data'
import {
  PerfValue,
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

  return <PerfValue value={() => runLoaderCacheSelectorComputation(deps())} />
}

function ListLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  return (
    <PerfValue value={() => runLoaderCacheSelectorComputation(loaderData())} />
  )
}

function ListPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>{() => <ListLoaderDepsSubscriber />}</For>
      <For each={subscriberSlots}>{() => <ListLoaderDataSubscriber />}</For>
      <div
        data-loader-cache-page="list"
        data-loader-cache-sequence={loaderData().sequence}
      />
      <Outlet />
    </>
  )
}
