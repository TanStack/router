import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  createReportLoaderData,
  deferredRouteGcTime,
  deferredRouteStaleTime,
  type ReportLoaderData,
} from '../../../shared'
import { createDeferredValueNode } from '../deferred-value'
import { Route as rootRoute } from './__root'

const ReportPage = Vue.defineComponent({
  setup() {
    const data = Route.useLoaderData() as Vue.Ref<ReportLoaderData>

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

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred/reports/$reportId',
  loader: ({ params }) => createReportLoaderData(params.reportId),
  staleTime: deferredRouteStaleTime(),
  gcTime: deferredRouteGcTime,
  component: ReportPage,
})
