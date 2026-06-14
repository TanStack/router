import * as Vue from 'vue'
import {
  Await,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'
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
  type DetailsLoaderData,
  type ItemLoaderData,
  type ReportLoaderData,
} from '../../shared'

function createDeferredValueNode(
  markerKey: string,
  promise: Promise<DeferredPayload>,
) {
  return (
    <Vue.Suspense>
      {{
        default: () => (
          <Await
            promise={promise}
            children={(payload: DeferredPayload) => (
              <span
                data-deferred-marker={deferredResolvedMarker(markerKey)}
                data-deferred-checksum={payload.checksum}
              >
                {payload.label}
              </span>
            )}
          />
        ),
        fallback: () => (
          <span data-deferred-marker={deferredFallbackMarker(markerKey)}>
            Loading {markerKey}
          </span>
        ),
      }}
    </Vue.Suspense>
  )
}

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const DeferredIndex = Vue.defineComponent({
  setup() {
    return () => <main data-deferred-page="index" />
  },
})

const ItemPage = Vue.defineComponent({
  setup() {
    const data = itemRoute.useLoaderData() as Vue.Ref<ItemLoaderData>

    return () => (
      <main data-deferred-page="item" data-deferred-id={data.value.critical.id}>
        <strong data-deferred-critical={data.value.critical.checksum}>
          {data.value.critical.label}
        </strong>
        {createDeferredValueNode(data.value.primaryKey, data.value.primary)}
        {createDeferredValueNode(data.value.secondaryKey, data.value.secondary)}
        <Outlet />
      </main>
    )
  },
})

const DetailsPage = Vue.defineComponent({
  setup() {
    const data = detailsRoute.useLoaderData() as Vue.Ref<DetailsLoaderData>

    return () => (
      <section
        data-deferred-page="details"
        data-deferred-id={data.value.critical.id}
      >
        <strong data-deferred-critical={data.value.critical.checksum}>
          {data.value.critical.label}
        </strong>
        {createDeferredValueNode(data.value.detailsKey, data.value.details)}
      </section>
    )
  },
})

const ReportPage = Vue.defineComponent({
  setup() {
    const data = reportRoute.useLoaderData() as Vue.Ref<ReportLoaderData>

    return () => (
      <main
        data-deferred-page="report"
        data-deferred-id={data.value.critical.id}
      >
        <strong data-deferred-critical={data.value.critical.checksum}>
          {data.value.critical.label}
        </strong>
        {data.value.sections.map((section) =>
          createDeferredValueNode(section.key, section.promise),
        )}
      </main>
    )
  },
})

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
  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })
  let didUnmount = false

  app.mount(container)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}

export {
  getDeferredRegistrySnapshot,
  resetDeferredRegistry,
  resolveDeferredKey,
  resolveReportDeferredKeys,
}
