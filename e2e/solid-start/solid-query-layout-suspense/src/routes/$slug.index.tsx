import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/$slug/')({
  component: SlugIndex,
})

function SlugIndex() {
  const params = Route.useParams()
  return <div data-testid="slug-index">Slug index: {params().slug}</div>
}
