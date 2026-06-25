import { Outlet, createRoute, useRouterState } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import {
  buildLoaderCachePayload,
  loaderCacheRuntime,
  runLoaderCacheSelectorComputation,
  subscriberSlots,
} from '../runtime'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/data',
  loader: () => {
    const sequence = loaderCacheRuntime.recordSyncLoad('data')
    return buildLoaderCachePayload('data', sequence, 11)
  },
  staleTime: 60_000,
  gcTime: 60_000,
  component: DataLayout,
})

function RouterLoadingSubscriber() {
  const loading = useRouterState({
    select: (state) =>
      (state.isLoading ? 1 : 0) + (state.status === 'pending' ? 1 : 0),
  })

  void runLoaderCacheSelectorComputation(loading)
  return null
}

function DataLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function DataLayout() {
  const loaderData = Route.useLoaderData()

  return (
    <>
      <RouterLoadingSubscriber />
      {subscriberSlots.map((slot) => (
        <DataLoaderDataSubscriber key={`data-loader-${slot}`} />
      ))}
      <div
        data-loader-cache-page="data"
        data-loader-cache-sequence={loaderData.sequence}
      />
      <Outlet />
    </>
  )
}
