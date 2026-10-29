import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/posts"!</div>
}
