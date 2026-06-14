import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import { Route as dataRoute } from './data'
import {
  PerfValue,
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

  return <PerfValue value={() => runLoaderCacheSelectorComputation(deps())} />
}

function ConditionalLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  return (
    <PerfValue value={() => runLoaderCacheSelectorComputation(loaderData())} />
  )
}

function ConditionalPage() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>
        {() => <ConditionalLoaderDepsSubscriber />}
      </For>
      <For each={subscriberSlots}>
        {() => <ConditionalLoaderDataSubscriber />}
      </For>
      <div
        data-loader-cache-page="conditional"
        data-loader-cache-sequence={loaderData().sequence}
      />
    </>
  )
}
