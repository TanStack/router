import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/items/$id')({
  component: ItemPage,
})

function ItemPage() {
  const params = Route.useParams()

  return (
    <main>
      <p data-testid="page-state">{`item-${params.id}`}</p>
    </main>
  )
}
