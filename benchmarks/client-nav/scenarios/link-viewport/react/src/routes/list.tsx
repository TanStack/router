import { Link, createFileRoute } from '@tanstack/react-router'
import { itemIds, listMarker, viewportLinkClass } from '../../../shared'

export const Route = createFileRoute('/list')({
  component: ListPage,
})

function ListPage() {
  return (
    <main>
      <p data-testid="page-state">{listMarker}</p>
      <ul>
        {itemIds.map((id) => (
          <li key={id}>
            <Link
              to="/items/$id"
              params={{ id }}
              preload="viewport"
              className={viewportLinkClass}
            >
              {`Item ${id}`}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
