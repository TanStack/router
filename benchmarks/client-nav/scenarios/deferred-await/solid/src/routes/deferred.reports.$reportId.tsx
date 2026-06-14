import { createRoute } from '@tanstack/solid-router'
import {
  createReportLoaderData,
  deferredRouteStaleTime,
  type ReportSectionLoaderData,
} from '../../../shared'
import { DeferredValue } from '../deferred-value'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred/reports/$reportId',
  loader: ({ params }) => createReportLoaderData(params.reportId),
  staleTime: deferredRouteStaleTime(),
  gcTime: 0,
  component: ReportPage,
})

function ReportPage() {
  const data = Route.useLoaderData()

  return (
    <main data-deferred-page="report" data-deferred-id={data().critical.id}>
      <strong data-deferred-critical={data().critical.checksum}>
        {data().critical.label}
      </strong>
      {data().sections.map((section: ReportSectionLoaderData) => (
        <DeferredValue markerKey={section.key} promise={section.promise} />
      ))}
    </main>
  )
}
