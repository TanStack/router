import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const ReportPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()

    return () => (
      <div data-route-marker="report" data-report-id={params.value.reportId} />
    )
  },
})

export const Route = createFileRoute('/dashboard/reports/$reportId')({
  component: ReportPage,
})
