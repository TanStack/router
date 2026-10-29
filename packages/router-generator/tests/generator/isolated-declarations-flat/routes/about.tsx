import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/about"!</div>
}
