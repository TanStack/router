import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/$slug/$child')({
  component: SlugChild,
})

function SlugChild() {
  const params = Route.useParams()
  return (
    <div data-testid="slug-child">
      Child: {params().slug}/{params().child}
    </div>
  )
}
