import * as Vue from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'
import { itemIds, listMarker, viewportLinkClass } from '../../../shared'

const ListPage = Vue.defineComponent({
  setup() {
    return () => (
      <main>
        <p data-testid="page-state">{listMarker}</p>
        <ul>
          {itemIds.map((id) => (
            <li key={id}>
              <Link
                to="/items/$id"
                params={{ id }}
                preload="viewport"
                class={viewportLinkClass}
              >
                {`Item ${id}`}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    )
  },
})

export const Route = createFileRoute('/list')({
  component: ListPage,
})
