import type { ReactElement } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { createRootRouteForPreloading } from './__root'
import {
  normalizeReportSearch,
  preloadComponent,
  recordReportLoader,
  reportPreloadStaleWindowMs,
  staleWindowMs,
} from '../preloading'

type RootRoute = ReturnType<typeof createRootRouteForPreloading>

type PreloadableComponent = (() => ReactElement) & {
  preload?: () => Promise<void>
}

export function createReportRoute(rootRoute: RootRoute) {
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

  function ReportPage() {
    const params = reportRoute.useParams()

    return (
      <article data-preloading-page="report" data-report-id={params.reportId}>
        Report
      </article>
    )
  }

  ;(ReportPage as PreloadableComponent).preload = () =>
    preloadComponent('report')

  return reportRoute
}
