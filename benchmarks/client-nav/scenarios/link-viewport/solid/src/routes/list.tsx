import { For } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { itemIds, listMarker, viewportLinkClass } from '../../../shared'

export const Route = createFileRoute('/list')({
  component: ListPage,
})

function ListPage() {
  return (
    <main>
      <p data-testid="page-state">{listMarker}</p>
      <ul>
        <For each={itemIds}>
          {(id) => (
            <li>
              <Link
                to="/items/$id"
                params={{ id }}
                preload="viewport"
                class={viewportLinkClass}
              >
                {`Item ${id}`}
              </Link>
            </li>
          )}
        </For>
      </ul>
    </main>
  )
}
