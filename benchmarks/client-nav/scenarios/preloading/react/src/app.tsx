import type { ReactElement } from 'react'
import {
  Link,
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import {
  BOOTSTRAP_INTENT_ITEM_ID,
  BOOTSTRAP_RENDER_REPORT_ID,
  BOOTSTRAP_VIEWPORT_ITEM_ID,
  DEFAULT_ITEM_SEARCH,
  DEFAULT_REPORT_SEARCH,
  INTENT_ITEM_SEARCH,
  VIEWPORT_ITEM_SEARCH,
  getPreloadingCounters,
  normalizeItemSearch,
  normalizePreloadIndexSearch,
  normalizeReportSearch,
  recordComponentPreload,
  recordDetailLoader,
  recordItemBeforeLoad,
  recordItemLoader,
  recordLazyLoader,
  recordLazyRouteResolution,
  recordReportLoader,
  resetPreloadingCounters,
  runPreloadingComputation,
} from '../../shared'

type PreloadableComponent = (() => ReactElement) & {
  preload?: () => Promise<void>
}

const staleWindowMs = 60_000
const reportPreloadStaleWindowMs = 120_000

function preloadComponent(kind: Parameters<typeof recordComponentPreload>[0]) {
  recordComponentPreload(kind)
  return Promise.resolve()
}

function createRouteTree() {
  const rootRoute = createRootRoute({
    component: Root,
  })

  const preloadIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload',
    validateSearch: normalizePreloadIndexSearch,
    component: PreloadIndex,
  })

  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/items/$itemId',
    validateSearch: normalizeItemSearch,
    beforeLoad: ({ params }) => ({
      itemSeed: recordItemBeforeLoad(params.itemId),
    }),
    loaderDeps: ({ search }) => ({ view: search.view }),
    loader: ({ params, deps, context }) => ({
      checksum: recordItemLoader(params.itemId, deps),
      contextChecksum: runPreloadingComputation(context.itemSeed, 12),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: staleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: staleWindowMs,
    component: ItemPage,
  })

  const itemDetailsRoute = createRoute({
    getParentRoute: () => itemRoute,
    path: 'details',
    loaderDeps: ({ search }) => ({ view: search.view }),
    loader: ({ params, deps }) => ({
      checksum: recordDetailLoader(params.itemId, deps),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: staleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: staleWindowMs,
    component: DetailsPage,
  })

  const reportRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/reports/$reportId',
    validateSearch: normalizeReportSearch,
    loaderDeps: ({ search }) => ({ tab: search.tab, page: search.page }),
    loader: ({ params, deps }) => ({
      checksum: recordReportLoader(params.reportId, deps),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: reportPreloadStaleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: reportPreloadStaleWindowMs,
    component: ReportPage,
  })

  const parkRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/park',
    component: ParkPage,
  })

  const lazyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/lazy/$lazyId',
    loader: ({ params }) => ({
      checksum: recordLazyLoader(params.lazyId),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: staleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: staleWindowMs,
  }).lazy(async () => {
    recordLazyRouteResolution()
    return createLazyRoute('/preload/lazy/$lazyId')({
      component: LazyPage,
    })
  })

  function Root() {
    return <Outlet />
  }

  function PreloadIndex() {
    const search = preloadIndexRoute.useSearch()

    return (
      <section data-preloading-page="index">
        <Link
          data-testid="intent-preload-item"
          to="/preload/items/$itemId"
          params={{ itemId: search.intentItemId }}
          search={INTENT_ITEM_SEARCH}
          preload="intent"
          preloadDelay={0}
          replace
        >
          Intent item
        </Link>
        <Link
          data-testid="render-preload-report"
          to="/preload/reports/$reportId"
          params={{ reportId: search.renderReportId }}
          search={DEFAULT_REPORT_SEARCH}
          preload="render"
          replace
        >
          Render report
        </Link>
        <Link
          data-testid="viewport-preload-item"
          to="/preload/items/$itemId"
          params={{ itemId: search.viewportItemId }}
          search={VIEWPORT_ITEM_SEARCH}
          preload="viewport"
          replace
        >
          Viewport item
        </Link>
        <Link
          data-testid="manual-preload-item"
          to="/preload/items/$itemId"
          params={{ itemId: BOOTSTRAP_INTENT_ITEM_ID }}
          search={DEFAULT_ITEM_SEARCH}
          replace
        >
          Manual item
        </Link>
      </section>
    )
  }

  function ItemPage() {
    const params = itemRoute.useParams()

    return (
      <article data-preloading-page="item" data-item-id={params.itemId}>
        <Outlet />
      </article>
    )
  }

  function DetailsPage() {
    const params = itemDetailsRoute.useParams()

    return (
      <article data-preloading-page="details" data-item-id={params.itemId}>
        Details
      </article>
    )
  }

  function ReportPage() {
    const params = reportRoute.useParams()

    return (
      <article data-preloading-page="report" data-report-id={params.reportId}>
        Report
      </article>
    )
  }

  function ParkPage() {
    return <article data-preloading-page="park">Park</article>
  }

  function LazyPage() {
    const params = lazyRoute.useParams()

    return (
      <article data-preloading-page="lazy" data-lazy-id={params.lazyId}>
        Lazy
      </article>
    )
  }

  ;(ItemPage as PreloadableComponent).preload = () => preloadComponent('item')
  ;(DetailsPage as PreloadableComponent).preload = () =>
    preloadComponent('details')
  ;(ReportPage as PreloadableComponent).preload = () =>
    preloadComponent('report')
  ;(LazyPage as PreloadableComponent).preload = () => preloadComponent('lazy')

  return rootRoute.addChildren([
    preloadIndexRoute,
    itemRoute.addChildren([itemDetailsRoute]),
    reportRoute,
    parkRoute,
    lazyRoute,
  ])
}

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [
        `/preload?intentItemId=${BOOTSTRAP_INTENT_ITEM_ID}&renderReportId=${BOOTSTRAP_RENDER_REPORT_ID}&viewportItemId=${BOOTSTRAP_VIEWPORT_ITEM_ID}`,
      ],
    }),
    defaultPreloadDelay: 0,
    routeTree: createRouteTree(),
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

export { getPreloadingCounters, resetPreloadingCounters }
