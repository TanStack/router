import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import {
  buildLoaderCachePayload,
  createItemLoaderDeps,
  createListLoaderDeps,
  createLoaderCacheRuntime,
  normalizeConditionalSearch,
  normalizeListSearch,
  runLoaderCacheSelectorComputation,
} from '../../shared.ts'

export const loaderCacheRuntime = createLoaderCacheRuntime()

const subscriberSlots = Array.from({ length: 5 }, (_, index) => index)

const rootRoute = createRootRoute({
  component: Root,
})

const dataRoute = createRoute({
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

const listRoute = createRoute({
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

const itemRoute = createRoute({
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

const staleRoute = createRoute({
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

const blockingRoute = createRoute({
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

const conditionalRoute = createRoute({
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

const evictRoute = createRoute({
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

function Root() {
  return <Outlet />
}

function RouterLoadingSubscriber() {
  const loading = useRouterState({
    select: (state) =>
      (state.isLoading ? 1 : 0) + (state.status === 'pending' ? 1 : 0),
  })

  void runLoaderCacheSelectorComputation(loading)
  return null
}

function DataLoaderDataSubscriber() {
  const loaderData = dataRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function ListLoaderDepsSubscriber() {
  const deps = listRoute.useLoaderDeps({
    select: (loaderDeps) =>
      loaderDeps.page + loaderDeps.filter.length + loaderDeps.tag.length,
  })

  void runLoaderCacheSelectorComputation(deps)
  return null
}

function ListLoaderDataSubscriber() {
  const loaderData = listRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function ItemLoaderDataSubscriber() {
  const loaderData = itemRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function StaleLoaderDataSubscriber() {
  const loaderData = staleRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function BlockingLoaderDataSubscriber() {
  const loaderData = blockingRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function ConditionalLoaderDepsSubscriber() {
  const deps = conditionalRoute.useLoaderDeps({
    select: (loaderDeps) => loaderDeps.key.length,
  })

  void runLoaderCacheSelectorComputation(deps)
  return null
}

function ConditionalLoaderDataSubscriber() {
  const loaderData = conditionalRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function EvictLoaderDataSubscriber() {
  const loaderData = evictRoute.useLoaderData({
    select: (data) => data.checksum + data.sequence,
  })

  void runLoaderCacheSelectorComputation(loaderData)
  return null
}

function DataLayout() {
  const loaderData = dataRoute.useLoaderData()

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

function ListPage() {
  const loaderData = listRoute.useLoaderData()

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

function ItemPage() {
  const loaderData = itemRoute.useLoaderData()

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

function StalePage() {
  const loaderData = staleRoute.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <StaleLoaderDataSubscriber key={`stale-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="stale"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}

function BlockingPage() {
  const loaderData = blockingRoute.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <BlockingLoaderDataSubscriber key={`blocking-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="blocking"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}

function ConditionalPage() {
  const loaderData = conditionalRoute.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <ConditionalLoaderDepsSubscriber key={`conditional-deps-${slot}`} />
      ))}
      {subscriberSlots.map((slot) => (
        <ConditionalLoaderDataSubscriber key={`conditional-data-${slot}`} />
      ))}
      <div
        data-loader-cache-page="conditional"
        data-loader-cache-sequence={loaderData.sequence}
      />
    </>
  )
}

function EvictPage() {
  const loaderData = evictRoute.useLoaderData()

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

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/data'],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree: rootRoute.addChildren([
      dataRoute.addChildren([
        listRoute.addChildren([itemRoute]),
        staleRoute,
        blockingRoute,
        conditionalRoute,
        evictRoute,
      ]),
    ]),
  })

  const reactRoot = createRoot(container)
  let didUnmount = false
  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
