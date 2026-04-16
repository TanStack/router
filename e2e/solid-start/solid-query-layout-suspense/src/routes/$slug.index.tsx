import { Link, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/$slug/')({
  component: SlugIndex,
})

function SlugIndex() {
  const params = Route.useParams()
  return (
    <div>
      <div data-testid="slug-index">Slug index: {params().slug}</div>
      <Link
        to="/$slug/$child"
        params={{ slug: params().slug, child: 'bar' }}
        data-testid="link-to-child"
      >
        Go to child
      </Link>
    </div>
  )
}
