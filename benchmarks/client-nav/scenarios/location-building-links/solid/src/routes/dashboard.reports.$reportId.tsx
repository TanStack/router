import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/dashboard/reports/$reportId')({
  component: ReportPage,
})

function ReportPage() {
  const params = Route.useParams()

  return <div data-route-marker="report" data-report-id={params().reportId} />
}
