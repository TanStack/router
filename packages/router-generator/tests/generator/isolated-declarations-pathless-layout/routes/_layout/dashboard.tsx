import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_layout/dashboard"!</div>
}
