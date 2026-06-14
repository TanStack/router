import {
  Await,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import {
  createDetailsLoaderData,
  createItemLoaderData,
  createReportLoaderData,
  deferredFallbackMarker,
  deferredResolvedMarker,
  deferredRouteStaleTime,
  getDeferredRegistrySnapshot,
  resetDeferredRegistry,
  resolveDeferredKey,
  resolveReportDeferredKeys,
  type DeferredPayload,
  type ReportSectionLoaderData,
} from '../../shared'

function DeferredValue(props: {
  markerKey: string
  promise: Promise<DeferredPayload>
}) {
  return (
    <Await
      promise={props.promise}
      fallback={
        <span data-deferred-marker={deferredFallbackMarker(props.markerKey)}>
          Loading {props.markerKey}
        </span>
      }
    >
      {(payload) => (
        <span
          data-deferred-marker={deferredResolvedMarker(props.markerKey)}
          data-deferred-checksum={payload.checksum}
        >
          {payload.label}
        </span>
      )}
    </Await>
  )
}

function Root() {
  return <Outlet />
}

function DeferredIndex() {
  return <main data-deferred-page="index" />
}

function ItemPage() {
  const data = itemRoute.useLoaderData()

  return (
    <main data-deferred-page="item" data-deferred-id={data.critical.id}>
      <strong data-deferred-critical={data.critical.checksum}>
        {data.critical.label}
      </strong>
      <DeferredValue markerKey={data.primaryKey} promise={data.primary} />
      <DeferredValue markerKey={data.secondaryKey} promise={data.secondary} />
      <Outlet />
    </main>
  )
}

function DetailsPage() {
  const data = detailsRoute.useLoaderData()

  return (
    <section data-deferred-page="details" data-deferred-id={data.critical.id}>
      <strong data-deferred-critical={data.critical.checksum}>
        {data.critical.label}
      </strong>
      <DeferredValue markerKey={data.detailsKey} promise={data.details} />
    </section>
  )
}

function ReportPage() {
  const data = reportRoute.useLoaderData()

  return (
    <main data-deferred-page="report" data-deferred-id={data.critical.id}>
      <strong data-deferred-critical={data.critical.checksum}>
        {data.critical.label}
      </strong>
      {data.sections.map((section: ReportSectionLoaderData) => (
        <DeferredValue
          key={section.key}
          markerKey={section.key}
          promise={section.promise}
        />
      ))}
    </main>
  )
}

const rootRoute = createRootRoute({
  component: Root,
})

const deferredIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred',
  component: DeferredIndex,
})

const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred/items/$itemId',
  loader: ({ params }) => createItemLoaderData(params.itemId),
  staleTime: deferredRouteStaleTime(),
  gcTime: 0,
  component: ItemPage,
})

const detailsRoute = createRoute({
  getParentRoute: () => itemRoute,
  path: 'details',
  loader: ({ params }) => createDetailsLoaderData(params.itemId),
  staleTime: deferredRouteStaleTime(),
  gcTime: 0,
  component: DetailsPage,
})

const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred/reports/$reportId',
  loader: ({ params }) => createReportLoaderData(params.reportId),
  staleTime: deferredRouteStaleTime(),
  gcTime: 0,
  component: ReportPage,
})

const routeTree = rootRoute.addChildren([
  deferredIndexRoute,
  itemRoute.addChildren([detailsRoute]),
  reportRoute,
])

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/deferred'],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree,
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

export {
  getDeferredRegistrySnapshot,
  resetDeferredRegistry,
  resolveDeferredKey,
  resolveReportDeferredKeys,
}
