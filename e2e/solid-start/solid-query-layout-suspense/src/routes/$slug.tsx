import { Outlet, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/$slug')({
  component: SlugLayout,
})

function SlugLayout() {
  const params = Route.useParams()
  return (
    <div>
      <div data-testid="slug-layout">Slug: {params().slug}</div>
      <Outlet />
    </div>
  )
}
